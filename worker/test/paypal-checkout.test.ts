import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import worker from '../src/index'

const ORDER_ID = '5O190127TN364715T'
const CAPTURE_ID = '3Y662965014333303'

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

async function createIntake() {
  const response = await request('/api/v1/rental-intakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Campus Student',
      email: 'student@example.com',
      secondaryContact: '@campus.student',
      agree: true,
      turnstileToken: 'valid-token',
    }),
  })
  expect(response.status).toBe(201)
  return response.json<{ id: string; checkoutToken: string }>()
}

function checkoutBody(intake: { id: string; checkoutToken: string }) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intakeId: intake.id, checkoutToken: intake.checkoutToken }),
  }
}

function completedOrder(intakeId: string, amount = '49.99') {
  return {
    id: ORDER_ID,
    status: 'COMPLETED',
    purchase_units: [{
      custom_id: intakeId,
      payments: {
        captures: [{
          id: CAPTURE_ID,
          status: 'COMPLETED',
          amount: { currency_code: 'USD', value: amount },
        }],
      },
    }],
  }
}

function installCheckoutFetch(getIntakeId: () => string, captureAmount = '49.99') {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      return Response.json({ success: true, action: 'rental_intake', hostname: 'campusloop.attentionplease.build' })
    }
    if (url.startsWith('https://discord.com/api/webhooks/')) {
      return Response.json({ id: 'discord-message-id' })
    }
    if (url.endsWith('/v1/oauth2/token')) {
      return Response.json({ access_token: 'paypal-access-token' })
    }
    if (url.endsWith('/v2/checkout/orders') && init?.method === 'POST') {
      return Response.json({ id: ORDER_ID, status: 'CREATED' }, { status: 201 })
    }
    if (url.endsWith(`/v2/checkout/orders/${ORDER_ID}/capture`)) {
      return Response.json(completedOrder(getIntakeId(), captureAmount))
    }
    throw new Error(`Unexpected outbound request: ${url}`)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PayPal Checkout API', () => {
  test('creates an exact server-priced order with the intake ID as custom_id, then captures it', async () => {
    let intakeId = ''
    const fetchMock = installCheckoutFetch(() => intakeId)
    const intake = await createIntake()
    intakeId = intake.id

    const createResponse = await request('/api/v1/paypal/orders', checkoutBody(intake))
    expect(createResponse.status).toBe(201)
    expect(await createResponse.json()).toEqual({ orderId: ORDER_ID })

    const createCall = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/v2/checkout/orders') && init?.method === 'POST')
    const paypalPayload = JSON.parse(String(createCall?.[1]?.body))
    expect(paypalPayload.purchase_units[0]).toMatchObject({
      custom_id: intake.id,
      invoice_id: intake.id,
      amount: { currency_code: 'USD', value: '49.99' },
    })
    expect(paypalPayload.application_context.shipping_preference).toBe('NO_SHIPPING')

    const captureResponse = await request(`/api/v1/paypal/orders/${ORDER_ID}/capture`, checkoutBody(intake))
    expect(captureResponse.status).toBe(200)
    expect(await captureResponse.json()).toEqual({ orderId: ORDER_ID, status: 'COMPLETED' })

    const saved = await env.DB.prepare(`
      SELECT paypal_order_id, paypal_capture_id, payment_status, paid_at
      FROM rental_intakes WHERE public_id = ?1
    `).bind(intake.id).first<{
      paypal_order_id: string
      paypal_capture_id: string
      payment_status: string
      paid_at: string
    }>()
    expect(saved).toMatchObject({
      paypal_order_id: ORDER_ID,
      paypal_capture_id: CAPTURE_ID,
      payment_status: 'completed',
    })
    expect(saved?.paid_at).toMatch(/Z$/)

    const discordPatch = fetchMock.mock.calls.find(([input, init]) =>
      String(input).includes('/messages/discord-message-id') && init?.method === 'PATCH')
    expect(discordPatch).toBeDefined()
    expect(String(discordPatch?.[1]?.body)).toContain('✅ PayPal 결제 완료')
    expect(String(discordPatch?.[1]?.body)).toContain(ORDER_ID)
  })

  test('rejects an invalid checkout capability before contacting PayPal', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await env.DB.prepare(`
      INSERT INTO rental_intakes (
        public_id, customer_name, customer_email, consent_at, created_at,
        checkout_token_hash, payment_status
      ) VALUES ('CLR-123456789ABC', 'Student', 'student@example.com', ?1, ?1, 'not-the-token', 'pending')
    `).bind(new Date().toISOString()).run()

    const response = await request('/api/v1/paypal/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intakeId: 'CLR-123456789ABC', checkoutToken: 'x'.repeat(43) }),
    })

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('fails closed when PayPal returns a completed capture with the wrong amount', async () => {
    let intakeId = ''
    installCheckoutFetch(() => intakeId, '1.00')
    const intake = await createIntake()
    intakeId = intake.id
    expect((await request('/api/v1/paypal/orders', checkoutBody(intake))).status).toBe(201)

    const response = await request(`/api/v1/paypal/orders/${ORDER_ID}/capture`, checkoutBody(intake))

    expect(response.status).toBe(502)
    expect(await env.DB.prepare(`SELECT payment_status FROM rental_intakes WHERE public_id = ?1`).bind(intake.id).first('payment_status')).toBe('created')
  })
})

describe('PayPal webhook API', () => {
  async function seedWebhookIntake() {
    const now = new Date().toISOString()
    await env.DB.prepare(`
      INSERT INTO rental_intakes (
        public_id, customer_name, customer_email, secondary_contact, consent_at, created_at,
        paypal_order_id, payment_status, discord_message_id
      ) VALUES ('CLR-123456789ABC', 'Student', 'student@example.com', '@student', ?1, ?1, ?2, 'created', 'discord-message-id')
    `).bind(now, ORDER_ID).run()
  }

  function webhookEvent() {
    return {
      id: 'WH-TEST-EVENT-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: CAPTURE_ID,
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '49.99' },
        supplementary_data: { related_ids: { order_id: ORDER_ID } },
      },
    }
  }

  function webhookHeaders() {
    return {
      'Content-Type': 'application/json',
      'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
      'PAYPAL-CERT-URL': 'https://api-m.sandbox.paypal.com/cert.pem',
      'PAYPAL-TRANSMISSION-ID': 'transmission-id',
      'PAYPAL-TRANSMISSION-SIG': 'signature',
      'PAYPAL-TRANSMISSION-TIME': '2026-08-25T00:00:00Z',
    }
  }

  function installWebhookFetch(verificationStatus: 'SUCCESS' | 'FAILURE') {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'paypal-access-token' })
      if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
        const verification = JSON.parse(String(init?.body))
        expect(verification.webhook_id).toBe('test-paypal-webhook-id')
        expect(verification.webhook_event.id).toBe('WH-TEST-EVENT-1')
        return Response.json({ verification_status: verificationStatus })
      }
      if (url.includes('/messages/discord-message-id') && init?.method === 'PATCH') {
        return Response.json({ id: 'discord-message-id' })
      }
      throw new Error(`Unexpected outbound request: ${url}`)
    })
  }

  test('verifies a completed capture, updates D1 idempotently, and edits the Discord message', async () => {
    await seedWebhookIntake()
    const fetchMock = installWebhookFetch('SUCCESS')

    const send = () => request('/api/v1/paypal/webhooks', {
      method: 'POST',
      headers: webhookHeaders(),
      body: JSON.stringify(webhookEvent()),
    })
    expect((await send()).status).toBe(204)
    expect((await send()).status).toBe(204)

    expect(await env.DB.prepare('SELECT payment_status FROM rental_intakes').first('payment_status')).toBe('completed')
    expect(await env.DB.prepare('SELECT paypal_capture_id FROM rental_intakes').first('paypal_capture_id')).toBe(CAPTURE_ID)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM paypal_webhook_events').first('count')).toBe(1)
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).includes('/messages/discord-message-id') && init?.method === 'PATCH')).toBe(true)
  })

  test('rejects an unverified webhook without changing payment state', async () => {
    await seedWebhookIntake()
    installWebhookFetch('FAILURE')

    const response = await request('/api/v1/paypal/webhooks', {
      method: 'POST',
      headers: webhookHeaders(),
      body: JSON.stringify(webhookEvent()),
    })

    expect(response.status).toBe(401)
    expect(await env.DB.prepare('SELECT payment_status FROM rental_intakes').first('payment_status')).toBe('created')
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM paypal_webhook_events').first('count')).toBe(0)
  })
})
