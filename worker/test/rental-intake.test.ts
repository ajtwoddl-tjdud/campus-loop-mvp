import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import worker from '../src/index'

const VALID_INTAKE = {
  name: '  Campus Student  ',
  email: 'STUDENT@example.com',
  secondaryContact: '  @campus.student  ',
  agree: true,
  turnstileToken: 'valid-token',
}

function mockTurnstile(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      return Response.json({
        success: true,
        action: 'rental_intake',
        hostname: 'campusloop.attentionplease.build',
        ...overrides,
      })
    }
    if (url.startsWith('https://discord.com/api/webhooks/')) {
      return Response.json({ id: 'discord-message-id' })
    }
    throw new Error(`Unexpected outbound request: ${url}`)
  })
}

async function request(path: string, init?: RequestInit) {
  const context = createExecutionContext()
  const response = await worker.fetch(
    new Request(`https://campusloop.attentionplease.build${path}`, init),
    env,
    context,
  )
  await waitOnExecutionContext(context)
  return response
}

async function post(payload: unknown = VALID_INTAKE) {
  return request('/api/v1/rental-intakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rental intake API', () => {
  test('stores normalized customer details and returns no contact data', async () => {
    const fetchMock = mockTurnstile()

    const response = await post()

    expect(response.status).toBe(201)
    const body = await response.json<Record<string, unknown>>()
    expect(body.id).toMatch(/^CLR-[A-F0-9]{12}$/)
    expect(body).toMatchObject({ status: 'received' })
    expect(body.createdAt).toMatch(/Z$/)
    expect(body.checkoutToken).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(body.paypal).toEqual({ clientId: 'test-paypal-client-id', environment: 'sandbox' })
    expect(body).not.toHaveProperty('name')
    expect(body).not.toHaveProperty('email')
    expect(body).not.toHaveProperty('secondaryContact')

    const saved = await env.DB.prepare(`
      SELECT customer_name, customer_email, secondary_contact, checkout_token_hash,
        payment_status, discord_message_id FROM rental_intakes
    `).first<{
      customer_name: string
      customer_email: string
      secondary_contact: string
      checkout_token_hash: string
      payment_status: string
      discord_message_id: string
    }>()
    expect(saved).toMatchObject({
      customer_name: 'Campus Student',
      customer_email: 'student@example.com',
      secondary_contact: '@campus.student',
      payment_status: 'pending',
      discord_message_id: 'discord-message-id',
    })
    expect(saved?.checkout_token_hash).not.toBe(body.checkoutToken)

    const webhookCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith('https://discord.com/api/webhooks/'))
    expect(webhookCall).toBeDefined()
    const webhookUrl = new URL(String(webhookCall?.[0]))
    expect(webhookUrl.searchParams.get('wait')).toBe('true')
    const payload = JSON.parse(String(webhookCall?.[1]?.body))
    expect(payload.allowed_mentions).toEqual({ parse: [] })
    expect(payload.embeds[0].fields).toEqual(expect.arrayContaining([
      { name: '이름', value: 'Campus Student', inline: true },
      { name: '이메일', value: 'student@example.com', inline: true },
      { name: '보조 연락처', value: '@campus.student', inline: false },
      { name: '개인정보 동의', value: '완료', inline: true },
      { name: '결제 상태', value: '⏳ PayPal 결제 대기', inline: false },
    ]))
    expect(JSON.stringify(payload)).not.toContain('valid-token')
  })

  test('stores an omitted secondary contact as null', async () => {
    mockTurnstile()

    const response = await post({ ...VALID_INTAKE, secondaryContact: '  ' })

    expect(response.status).toBe(201)
    expect(await env.DB.prepare('SELECT secondary_contact FROM rental_intakes').first('secondary_contact')).toBeNull()
  })

  test.each([
    ['name', { name: ' ' }],
    ['email', { email: 'not-an-email' }],
    ['privacy consent', { agree: false }],
    ['secondary contact length', { secondaryContact: 'x'.repeat(161) }],
    ['unknown fields', { housing: 'dorm' }],
  ])('rejects invalid %s', async (_label, patch) => {
    mockTurnstile()

    const response = await post({ ...VALID_INTAKE, ...patch })

    expect(response.status).toBe(422)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM rental_intakes').first('count')).toBe(0)
  })

  test.each([
    ['failed verification', { success: false }],
    ['wrong action', { action: 'pilot_application' }],
    ['wrong hostname', { hostname: 'attacker.example' }],
  ])('fails closed for Turnstile %s', async (_label, turnstileResponse) => {
    mockTurnstile(turnstileResponse)

    const response = await post()

    expect(response.status).toBe(403)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM rental_intakes').first('count')).toBe(0)
  })

  test('rejects malformed, unsupported, oversized, and read requests', async () => {
    const malformed = await request('/api/v1/rental-intakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    expect(malformed.status).toBe(400)

    expect((await request('/api/v1/rental-intakes', { method: 'POST', body: '{}' })).status).toBe(415)
    expect((await request('/api/v1/rental-intakes', { method: 'GET' })).status).toBe(405)

    const oversized = await request('/api/v1/rental-intakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(16 * 1024) }),
    })
    expect(oversized.status).toBe(413)
  })

  test('returns a generic error and no contact data when D1 rejects the insert', async () => {
    mockTurnstile()
    await env.DB.prepare(`
      CREATE TRIGGER reject_rental_insert
      BEFORE INSERT ON rental_intakes
      BEGIN
        SELECT RAISE(FAIL, 'forced test failure');
      END
    `).run()

    try {
      const response = await post()
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { code: 'storage_failed', message: 'Customer details could not be saved.' },
      })
    } finally {
      await env.DB.prepare('DROP TRIGGER reject_rental_insert').run()
    }
  })

  test('keeps a saved intake successful when the Discord notification fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith('https://challenges.cloudflare.com/')) {
        return Response.json({
          success: true,
          action: 'rental_intake',
          hostname: 'campusloop.attentionplease.build',
        })
      }
      if (url.startsWith('https://discord.com/api/webhooks/')) {
        return new Response('unavailable', { status: 503 })
      }
      throw new Error(`Unexpected outbound request: ${url}`)
    })

    const response = await post()

    expect(response.status).toBe(201)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM rental_intakes').first('count')).toBe(1)
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('"event":"discord_rental_intake_failed"'))
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('student@example.com')
  })
})
