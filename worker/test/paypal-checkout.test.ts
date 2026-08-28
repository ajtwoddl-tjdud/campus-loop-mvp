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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PayPal Checkout API', () => {
  test.each([
    ['/api/v1/paypal/orders'],
    [`/api/v1/paypal/orders/${ORDER_ID}/capture`],
  ])('blocks %s without contacting PayPal', async (path) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intakeId: 'CLR-123456789ABC', checkoutToken: 'x'.repeat(43) }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'sold_out',
        message: 'Campus Loop bedding sets are sold out. New sign-ups and PayPal payments are closed.',
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
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
