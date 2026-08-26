import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import { vi } from 'vitest'

import worker, { adminPageResponse } from '../src/index'

const ORIGIN = 'https://campusloop.attentionplease.build'
const INTAKE_ID = 'CLR-123456789ABC'
const TEST_ORDER_ID = '9AB12345CD678901E'
const TEST_CAPTURE_ID = '8CD12345EF678901G'

async function request(path: string, init?: RequestInit) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, init), env, context)
  await waitOnExecutionContext(context)
  return response
}

async function seedIntake() {
  await env.DB.prepare(`
    INSERT INTO rental_intakes (
      public_id, customer_name, customer_email, secondary_contact, consent_at, created_at,
      payment_status, fulfillment_status, refund_status, admin_notes
    ) VALUES (?1, 'Campus Student', 'student@example.com', '@student', ?2, ?2, 'pending', 'pending', 'not_due', '')
  `).bind(INTAKE_ID, '2026-08-26T00:00:00.000Z').run()
}

async function login(password = 'test-admin-password', extraHeaders: Record<string, string> = {}) {
  return request('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.10', ...extraHeaders },
    body: JSON.stringify({ username: 'admin', password }),
  })
}

async function authenticated() {
  const response = await login()
  expect(response.status).toBe(200)
  const body = await response.json<{ csrfToken: string }>()
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  expect(cookie).toBeTruthy()
  return { cookie: cookie as string, csrfToken: body.csrfToken }
}

describe('Admin backoffice API', () => {
  test('serves a matching CSP nonce to the admin page and PayPal SDK', async () => {
    const response = adminPageResponse(new Response('<!doctype html><html><head></head><body></body></html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))
    const html = await response.text()
    const nonce = html.match(/<meta name="csp-nonce" content="([^"]+)">/)?.[1]

    expect(nonce).toBeTruthy()
    expect(response.headers.get('content-security-policy')).toContain(`script-src 'self' https://www.paypal.com https://www.paypalobjects.com 'nonce-${nonce}'`)
    expect(response.headers.get('content-security-policy')).toContain(`style-src 'self' https://fonts.googleapis.com https://*.paypal.com https://www.paypalobjects.com 'nonce-${nonce}'`)
    expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-inline'")
  })

  test('requires authentication for operational data', async () => {
    const session = await request('/api/v1/admin/session')
    const intakes = await request('/api/v1/admin/intakes')

    expect(session.status).toBe(401)
    expect(intakes.status).toBe(401)
    expect(session.headers.get('cache-control')).toBe('no-store')
  })

  test('rejects untrusted origins and wrong credentials without issuing a session', async () => {
    const noOrigin = await request('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'test-admin-password' }),
    })
    const wrong = await login('wrong-password')

    expect(noOrigin.status).toBe(403)
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()
  })

  test('issues a hardened session and returns overview plus searchable operational data', async () => {
    await seedIntake()
    const { cookie } = await authenticated()
    const loginResponse = await login()
    const setCookie = loginResponse.headers.get('set-cookie') || ''

    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).toContain('Path=/')

    const overview = await request('/api/v1/admin/overview', { headers: { Cookie: cookie } })
    expect(await overview.json()).toMatchObject({ total: 1, paid: 0, ready: 0 })
    const list = await request('/api/v1/admin/intakes?q=student%40example.com', { headers: { Cookie: cookie } })
    const data = await list.json<{ items: Record<string, unknown>[]; total: number }>()
    expect(data.total).toBe(1)
    expect(data.items[0]).toMatchObject({ id: INTAKE_ID, customerName: 'Campus Student', paymentStatus: 'pending' })
    expect(data.items[0]).not.toHaveProperty('checkoutTokenHash')
  })

  test('requires CSRF and records an audit trail for validated edits', async () => {
    await seedIntake()
    const { cookie, csrfToken } = await authenticated()
    const body = JSON.stringify({
      customerName: 'Updated Student',
      paymentStatus: 'completed',
      fulfillmentStatus: 'ready',
      refundStatus: 'pending',
      adminNotes: '현장 결제 확인',
    })
    const withoutCsrf = await request(`/api/v1/admin/intakes/${INTAKE_ID}`, {
      method: 'PATCH', headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json' }, body,
    })
    expect(withoutCsrf.status).toBe(403)

    const response = await request(`/api/v1/admin/intakes/${INTAKE_ID}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body,
    })
    expect(response.status).toBe(200)
    const saved = await env.DB.prepare(`SELECT customer_name, payment_status, fulfillment_status, refund_status, admin_notes, paid_at FROM rental_intakes WHERE public_id = ?1`).bind(INTAKE_ID).first<Record<string, unknown>>()
    expect(saved).toMatchObject({ customer_name: 'Updated Student', payment_status: 'completed', fulfillment_status: 'ready', refund_status: 'pending', admin_notes: '현장 결제 확인' })
    expect(saved?.paid_at).toBeTruthy()
    const audit = await env.DB.prepare('SELECT actor, before_json, after_json FROM admin_audit_log').first<Record<string, string>>()
    expect(audit?.actor).toBe('admin')
    expect(JSON.parse(audit?.before_json || '{}')).toMatchObject({ customerName: 'Campus Student' })
    expect(JSON.parse(audit?.after_json || '{}')).toMatchObject({ customerName: 'Updated Student', paymentStatus: 'completed' })
  })

  test('rejects unknown edit fields and invalid status values', async () => {
    await seedIntake()
    const { cookie, csrfToken } = await authenticated()
    const response = await request(`/api/v1/admin/intakes/${INTAKE_ID}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ paymentStatus: 'refunded', paypalOrderId: 'forged' }),
    })
    expect(response.status).toBe(422)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM admin_audit_log').first('count')).toBe(0)
  })

  test('rate limits repeated failed logins by a non-reversible client key', async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect((await login('wrong-password')).status).toBe(401)
    }
    const limited = await login('wrong-password')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
    const stored = await env.DB.prepare('SELECT key_hash FROM admin_login_attempts').first<{ key_hash: string }>()
    expect(stored?.key_hash).not.toContain('203.0.113.10')
  })

  test('creates and captures a server-priced admin-only $1 PayPal verification order', async () => {
    const { cookie, csrfToken } = await authenticated()
    let testId = ''
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'paypal-access-token' })
      if (url.endsWith('/v2/checkout/orders') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body))
        testId = payload.purchase_units[0].custom_id
        expect(payload.purchase_units[0]).toMatchObject({
          custom_id: testId,
          amount: { currency_code: 'USD', value: '1.00' },
          items: [{ name: 'Campus Loop Checkout Verification', unit_amount: { currency_code: 'USD', value: '1.00' } }],
        })
        expect(payload.application_context.shipping_preference).toBe('NO_SHIPPING')
        return Response.json({ id: TEST_ORDER_ID, status: 'CREATED' }, { status: 201 })
      }
      if (url.endsWith(`/v2/checkout/orders/${TEST_ORDER_ID}/capture`)) {
        return Response.json({
          id: TEST_ORDER_ID,
          status: 'COMPLETED',
          purchase_units: [{
            custom_id: testId,
            payments: { captures: [{
              id: TEST_CAPTURE_ID,
              status: 'COMPLETED',
              amount: { currency_code: 'USD', value: '1.00' },
            }] },
          }],
        })
      }
      throw new Error(`Unexpected outbound request: ${url}`)
    })
    const headers = { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrfToken }

    const config = await request('/api/v1/admin/paypal/config', { headers: { Cookie: cookie } })
    expect(await config.json()).toMatchObject({ clientId: 'test-paypal-client-id', environment: 'sandbox' })
    const created = await request('/api/v1/admin/paypal/test-orders', { method: 'POST', headers })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ orderId: TEST_ORDER_ID, testId })
    const captured = await request(`/api/v1/admin/paypal/test-orders/${TEST_ORDER_ID}/capture`, { method: 'POST', headers })
    expect(captured.status).toBe(200)
    expect(await captured.json()).toEqual({ orderId: TEST_ORDER_ID, testId, status: 'COMPLETED' })

    const saved = await env.DB.prepare(`
      SELECT paypal_capture_id, status, amount, currency, paid_at FROM admin_paypal_tests WHERE id = ?1
    `).bind(testId).first<Record<string, unknown>>()
    expect(saved).toMatchObject({ paypal_capture_id: TEST_CAPTURE_ID, status: 'completed', amount: '1.00', currency: 'USD' })
    expect(saved?.paid_at).toBeTruthy()
    const listed = await request('/api/v1/admin/paypal/test-orders', { headers: { Cookie: cookie } })
    expect(await listed.json()).toMatchObject({ items: [{ id: testId, status: 'completed', amount: '1.00' }] })
    expect(fetchMock).toHaveBeenCalled()
  })
})
