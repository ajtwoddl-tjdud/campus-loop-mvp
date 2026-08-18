import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import worker from '../src/index'

const VALID_APPLICATION = {
  isChungAngExchangeStudent: true,
  housing: 'dorm',
  arrivalDate: '2026-08-28',
  departureDate: '2026-12-20',
  name: '  Campus Student  ',
  email: 'STUDENT@example.com',
  agree: true,
  turnstileToken: 'valid-token',
}

function mockTurnstile(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
    success: true,
    action: 'pilot_application',
    hostname: 'campusloop.attentionplease.build',
    ...overrides,
  }))
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

async function post(payload: unknown = VALID_APPLICATION) {
  return request('/api/v1/pilot-applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Campus Loop Worker', () => {
  test('reports health without exposing database details', async () => {
    const response = await request('/api/v1/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', service: 'campus-loop-worker' })
  })

  test('stores a verified application and returns no contact data', async () => {
    mockTurnstile()

    const response = await post()

    expect(response.status).toBe(201)
    const body = await response.json<Record<string, unknown>>()
    expect(body.id).toMatch(/^CLP-[A-F0-9]{12}$/)
    expect(body).toMatchObject({ status: 'received' })
    expect(body.createdAt).toMatch(/Z$/)
    expect(body).not.toHaveProperty('name')
    expect(body).not.toHaveProperty('email')

    const saved = await env.DB.prepare(
      'SELECT applicant_name, applicant_email, housing FROM pilot_applications',
    ).first<{ applicant_name: string; applicant_email: string; housing: string }>()
    expect(saved).toEqual({
      applicant_name: 'Campus Student',
      applicant_email: 'student@example.com',
      housing: 'dorm',
    })
  })

  test.each([
    ['student confirmation', { isChungAngExchangeStudent: false }],
    ['privacy consent', { agree: false }],
    ['email', { email: 'not-an-email' }],
    ['housing', { housing: 'hotel' }],
    ['calendar date', { arrivalDate: '2026-02-31' }],
    ['date order', { departureDate: '2026-08-27' }],
    ['unknown fields', { unexpected: true }],
  ])('rejects invalid %s', async (_label, patch) => {
    mockTurnstile()
    const response = await post({ ...VALID_APPLICATION, ...patch })

    expect(response.status).toBe(422)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM pilot_applications').first('count')).toBe(0)
  })

  test('rejects malformed JSON', async () => {
    const response = await request('/api/v1/pilot-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })

    expect(response.status).toBe(400)
  })

  test('rejects unsupported content types and oversized bodies', async () => {
    const wrongType = await request('/api/v1/pilot-applications', { method: 'POST', body: '{}' })
    expect(wrongType.status).toBe(415)

    const lookalikeType = await request('/api/v1/pilot-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: '{}',
    })
    expect(lookalikeType.status).toBe(415)

    const oversized = await request('/api/v1/pilot-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(16 * 1024) }),
    })
    expect(oversized.status).toBe(413)
  })

  test.each([
    ['failed verification', { success: false }],
    ['wrong action', { action: 'other_action' }],
    ['wrong hostname', { hostname: 'attacker.example' }],
  ])('fails closed for Turnstile %s', async (_label, turnstileResponse) => {
    mockTurnstile(turnstileResponse)
    const response = await post()

    expect(response.status).toBe(403)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM pilot_applications').first('count')).toBe(0)
  })

  test('rejects a missing Turnstile token as a verification failure', async () => {
    const { turnstileToken: _turnstileToken, ...withoutToken } = VALID_APPLICATION

    const response = await post(withoutToken)

    expect(response.status).toBe(403)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM pilot_applications').first('count')).toBe(0)
  })

  test('fails closed when Turnstile is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))

    const response = await post()

    expect(response.status).toBe(403)
  })

  test('returns a generic error and no contact data when D1 rejects the insert', async () => {
    mockTurnstile()
    await env.DB.prepare(`
      CREATE TRIGGER reject_pilot_insert
      BEFORE INSERT ON pilot_applications
      BEGIN
        SELECT RAISE(FAIL, 'forced test failure');
      END
    `).run()

    try {
      const response = await post()
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { code: 'storage_failed', message: 'Application could not be saved.' },
      })
    } finally {
      await env.DB.prepare('DROP TRIGGER reject_pilot_insert').run()
    }
  })

  test('does not expose application details or unsupported API routes', async () => {
    expect((await request('/api/v1/pilot-applications/CLP-NOT-PUBLIC')).status).toBe(404)
    expect((await request('/api/v1/unknown')).status).toBe(404)
    expect((await request('/api/v1/pilot-applications', { method: 'GET' })).status).toBe(405)
  })
})
