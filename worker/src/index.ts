const APPLICATION_PATH = '/api/v1/pilot-applications'
const RENTAL_INTAKE_PATH = '/api/v1/rental-intakes'
const HEALTH_PATH = '/api/v1/health'
const PAYPAL_ORDERS_PATH = '/api/v1/paypal/orders'
const PAYPAL_WEBHOOK_PATH = '/api/v1/paypal/webhooks'
const PAYPAL_CAPTURE_PATH = /^\/api\/v1\/paypal\/orders\/([A-Z0-9]{8,32})\/capture$/
const ADMIN_LOGIN_PATH = '/api/v1/admin/login'
const ADMIN_LOGOUT_PATH = '/api/v1/admin/logout'
const ADMIN_SESSION_PATH = '/api/v1/admin/session'
const ADMIN_OVERVIEW_PATH = '/api/v1/admin/overview'
const ADMIN_INTAKES_PATH = '/api/v1/admin/intakes'
const ADMIN_AUDIT_PATH = '/api/v1/admin/audit'
const ADMIN_PAYPAL_CONFIG_PATH = '/api/v1/admin/paypal/config'
const ADMIN_PAYPAL_TEST_ORDERS_PATH = '/api/v1/admin/paypal/test-orders'
const ADMIN_PAYPAL_TEST_CAPTURE_PATH = /^\/api\/v1\/admin\/paypal\/test-orders\/([A-Z0-9]{8,32})\/capture$/
const ADMIN_INTAKE_PATH = /^\/api\/v1\/admin\/intakes\/(CLR-[A-F0-9]{12})$/
const ADMIN_PAGE_PATH = /^\/admin(?:\/.*)?$/
const MAX_BODY_BYTES = 16 * 1024
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024
const MAX_ADMIN_BODY_BYTES = 8 * 1024
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'pilot_application'
const RENTAL_TURNSTILE_ACTION = 'rental_intake'
const PAYPAL_AMOUNT = '49.99'
const PAYPAL_TEST_AMOUNT = '1.00'
const PAYPAL_CURRENCY = 'USD'
const PUBLIC_SITE_URL = 'https://campusloop.attentionplease.build/'
const PAYPAL_PRODUCT_IMAGE_URL = `${PUBLIC_SITE_URL}assets/campus-loop-checkout.jpg`
const SALES_OPEN = false
const ADMIN_COOKIE_NAME = '__Host-campusloop_admin'
const ADMIN_SESSION_SECONDS = 8 * 60 * 60
const ADMIN_LOGIN_WINDOW_SECONDS = 15 * 60
const ADMIN_LOGIN_MAX_FAILURES = 5

const PAYMENT_STATUSES = new Set(['pending', 'created', 'completed'])
const FULFILLMENT_STATUSES = new Set(['pending', 'ready', 'collected', 'returned', 'cancelled'])
const REFUND_STATUSES = new Set(['not_due', 'pending', 'completed', 'failed'])

function soldOutResponse(): Response {
  return errorResponse(409, 'sold_out', 'Campus Loop bedding sets are sold out. New sign-ups and PayPal payments are closed.')
}

const APPLICATION_KEYS = new Set([
  'isChungAngExchangeStudent',
  'housing',
  'arrivalDate',
  'departureDate',
  'name',
  'email',
  'agree',
  'turnstileToken',
])

type ApplicationInput = {
  isChungAngExchangeStudent: true
  housing: 'dorm' | 'off'
  arrivalDate: string
  departureDate: string
  name: string
  email: string
  agree: true
  turnstileToken: string
}

const RENTAL_INTAKE_KEYS = new Set([
  'name',
  'email',
  'secondaryContact',
  'agree',
  'turnstileToken',
])

type RentalIntakeInput = {
  name: string
  email: string
  secondaryContact: string
  agree: true
  turnstileToken: string
}

type TurnstileResult = {
  success?: boolean
  action?: string
  hostname?: string
}

type DiscordEmbedField = {
  name: string
  value: string
  inline?: boolean
}

type RentalIntakeRecord = {
  public_id: string
  customer_name: string
  customer_email: string
  secondary_contact: string | null
  checkout_token_hash: string | null
  paypal_order_id: string | null
  paypal_capture_id: string | null
  payment_status: string
  paid_at: string | null
  discord_message_id: string | null
  fulfillment_status: string
  refund_status: string
  admin_notes: string
  updated_at: string | null
  consent_at: string
  created_at: string
}

type AdminSession = {
  username: string
  csrfToken: string
  issuedAt: number
  expiresAt: number
}

type AdminUpdateInput = {
  customerName?: string
  customerEmail?: string
  secondaryContact?: string | null
  paymentStatus?: 'pending' | 'created' | 'completed'
  fulfillmentStatus?: 'pending' | 'ready' | 'collected' | 'returned' | 'cancelled'
  refundStatus?: 'not_due' | 'pending' | 'completed' | 'failed'
  adminNotes?: string
}

type AdminLoginAttempt = {
  window_started_at: number
  failed_count: number
  locked_until: number
}

type AdminAuditRecord = {
  id: number
  intake_public_id: string
  actor: string
  action: string
  before_json: string
  after_json: string
  created_at: string
}

type AdminPayPalTestRecord = {
  id: string
  paypal_order_id: string
  paypal_capture_id: string | null
  status: 'created' | 'completed'
  amount: '1.00'
  currency: 'USD'
  created_by: string
  created_at: string
  paid_at: string | null
}

type CheckoutAccessInput = {
  intakeId: string
  checkoutToken: string
}

type PayPalAccessTokenResponse = {
  access_token?: string
}

type PayPalOrderResponse = {
  id?: string
  status?: string
  purchase_units?: unknown
}

type PayPalCaptureDetails = {
  orderId: string
  captureId: string
  customId: string
  status: 'COMPLETED'
}

type PayPalWebhookEvent = {
  id: string
  event_type: string
  resource: Record<string, unknown>
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
}

function validateApplication(value: unknown): ApplicationInput | null {
  if (!isRecord(value)) return null
  if (Object.keys(value).some((key) => !APPLICATION_KEYS.has(key))) return null
  if (value.isChungAngExchangeStudent !== true || value.agree !== true) return null
  if (value.housing !== 'dorm' && value.housing !== 'off') return null
  if (!isIsoDate(value.arrivalDate) || !isIsoDate(value.departureDate)) return null
  if (value.departureDate <= value.arrivalDate) return null
  if (typeof value.name !== 'string' || value.name.trim().length < 1 || value.name.trim().length > 120) return null
  if (typeof value.email !== 'string' || value.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return null
  if (typeof value.turnstileToken !== 'string' || value.turnstileToken.length < 1 || value.turnstileToken.length > 2048) return null
  return value as ApplicationInput
}

function validateRentalIntake(value: unknown): RentalIntakeInput | null {
  if (!isRecord(value)) return null
  if (Object.keys(value).some((key) => !RENTAL_INTAKE_KEYS.has(key))) return null
  if (value.agree !== true) return null
  if (typeof value.name !== 'string' || value.name.trim().length < 1 || value.name.trim().length > 120) return null
  if (typeof value.email !== 'string' || value.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return null
  if (typeof value.secondaryContact !== 'string' || value.secondaryContact.trim().length > 160) return null
  if (typeof value.turnstileToken !== 'string' || value.turnstileToken.length < 1 || value.turnstileToken.length > 2048) return null
  return value as RentalIntakeInput
}

async function readLimitedJson(
  request: Request,
  maxBodyBytes = MAX_BODY_BYTES,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number }> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) return { ok: false, status: 413 }
  if (!request.body) return { ok: false, status: 400 }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maxBodyBytes) {
      await reader.cancel()
      return { ok: false, status: 413 }
    }
    chunks.push(value)
  }

  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) }
  } catch {
    return { ok: false, status: 400 }
  }
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return encodeBase64Url(new Uint8Array(digest))
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padding = '='.repeat((4 - value.length % 4) % 4)
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

function constantTimeStringEqual(left: string, right: string): boolean {
  return constantTimeEqual(new TextEncoder().encode(left), new TextEncoder().encode(right))
}

async function verifyAdminPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false
  const iterations = Number(parts[1])
  const salt = decodeBase64Url(parts[2])
  const expected = decodeBase64Url(parts[3])
  if (iterations !== 100_000 || !salt || salt.length < 16 || !expected || expected.length !== 32) {
    return false
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations },
    key,
    256,
  )
  return constantTimeEqual(new Uint8Array(derived), expected)
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

async function createAdminSession(env: Env): Promise<{ session: AdminSession; cookie: string }> {
  const now = Math.floor(Date.now() / 1000)
  const csrfBytes = new Uint8Array(24)
  crypto.getRandomValues(csrfBytes)
  const session: AdminSession = {
    username: env.ADMIN_USERNAME,
    csrfToken: encodeBase64Url(csrfBytes),
    issuedAt: now,
    expiresAt: now + ADMIN_SESSION_SECONDS,
  }
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(session)))
  const signature = encodeBase64Url(await hmacSha256(env.ADMIN_SESSION_SECRET, payload))
  return {
    session,
    cookie: `${ADMIN_COOKIE_NAME}=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}`,
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim()
  }
  return null
}

async function getAdminSession(request: Request, env: Env): Promise<AdminSession | null> {
  const cookie = getCookie(request, ADMIN_COOKIE_NAME)
  if (!cookie) return null
  const separator = cookie.lastIndexOf('.')
  if (separator < 1) return null
  const payload = cookie.slice(0, separator)
  const providedSignature = decodeBase64Url(cookie.slice(separator + 1))
  if (!providedSignature) return null
  const expectedSignature = await hmacSha256(env.ADMIN_SESSION_SECRET, payload)
  if (!constantTimeEqual(providedSignature, expectedSignature)) return null
  const payloadBytes = decodeBase64Url(payload)
  if (!payloadBytes) return null
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes))
    if (!isRecord(value)) return null
    if (typeof value.username !== 'string' || !constantTimeStringEqual(value.username, env.ADMIN_USERNAME)) return null
    if (typeof value.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{24,64}$/.test(value.csrfToken)) return null
    if (typeof value.issuedAt !== 'number' || typeof value.expiresAt !== 'number' ||
        !Number.isInteger(value.issuedAt) || !Number.isInteger(value.expiresAt)) return null
    const now = Math.floor(Date.now() / 1000)
    if (value.issuedAt > now + 60 || value.expiresAt <= now || value.expiresAt - value.issuedAt !== ADMIN_SESSION_SECONDS) return null
    return {
      username: value.username,
      csrfToken: value.csrfToken,
      issuedAt: value.issuedAt,
      expiresAt: value.expiresAt,
    }
  } catch {
    return null
  }
}

function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return origin !== null && origin === new URL(request.url).origin
}

function hasValidCsrf(request: Request, session: AdminSession): boolean {
  const token = request.headers.get('x-csrf-token')
  return token !== null && constantTimeStringEqual(token, session.csrfToken)
}

function adminApiResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export function adminPageResponse(response: Response): Response {
  const nonceBytes = new Uint8Array(24)
  crypto.getRandomValues(nonceBytes)
  const cspNonce = encodeBase64Url(nonceBytes)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' https://www.paypal.com https://www.paypalobjects.com 'nonce-${cspNonce}'`,
    `style-src 'self' https://fonts.googleapis.com https://*.paypal.com https://www.paypalobjects.com 'nonce-${cspNonce}'`,
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://www.paypalobjects.com https://*.paypal.com",
    "connect-src 'self' https://*.paypal.com",
    "frame-src https://*.paypal.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '))
  const securedResponse = new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  if (!response.headers.get('content-type')?.includes('text/html') || response.body === null) return securedResponse
  return new HTMLRewriter()
    .on('head', { element(element) { element.append(`<meta name="csp-nonce" content="${cspNonce}">`, { html: true }) } })
    .transform(securedResponse)
}

async function checkoutTokenMatches(provided: string, expectedHash: string): Promise<boolean> {
  const providedHash = await sha256(provided)
  const providedBytes = new TextEncoder().encode(providedHash)
  const expectedBytes = new TextEncoder().encode(expectedHash)
  if (providedBytes.length !== expectedBytes.length) return false
  let difference = 0
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ expectedBytes[index]
  }
  return difference === 0
}

function validateCheckoutAccess(value: unknown): CheckoutAccessInput | null {
  if (!isRecord(value)) return null
  if (Object.keys(value).some((key) => key !== 'intakeId' && key !== 'checkoutToken')) return null
  if (typeof value.intakeId !== 'string' || !/^CLR-[A-F0-9]{12}$/.test(value.intakeId)) return null
  if (typeof value.checkoutToken !== 'string' || value.checkoutToken.length < 32 || value.checkoutToken.length > 128) return null
  return { intakeId: value.intakeId, checkoutToken: value.checkoutToken }
}

function paypalUrl(env: Env, path: string): string {
  return `${env.PAYPAL_API_BASE.replace(/\/$/, '')}${path}`
}

async function getPayPalAccessToken(env: Env): Promise<string> {
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)
  const response = await fetch(paypalUrl(env, '/v1/oauth2/token'), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('PayPal authentication failed')
  const data: unknown = await response.json()
  if (!isRecord(data) || typeof (data as PayPalAccessTokenResponse).access_token !== 'string') {
    throw new Error('PayPal access token was missing')
  }
  return (data as PayPalAccessTokenResponse).access_token as string
}

async function getAuthorizedIntake(env: Env, input: CheckoutAccessInput): Promise<RentalIntakeRecord | null> {
  const intake = await env.DB.prepare(`
    SELECT public_id, customer_name, customer_email, secondary_contact, checkout_token_hash,
      paypal_order_id, paypal_capture_id, payment_status, paid_at, discord_message_id,
      fulfillment_status, refund_status, admin_notes, updated_at, consent_at, created_at
    FROM rental_intakes WHERE public_id = ?1
  `).bind(input.intakeId).first<RentalIntakeRecord>()
  if (!intake?.checkout_token_hash) return null
  return await checkoutTokenMatches(input.checkoutToken, intake.checkout_token_hash) ? intake : null
}

async function verifyTurnstile(request: Request, env: Env, token: string, expectedAction: string): Promise<boolean> {
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
  })
  const remoteIp = request.headers.get('CF-Connecting-IP')
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return false
    const result: unknown = await response.json()
    if (!isRecord(result)) return false
    const verification = result as TurnstileResult
    const allowedHostnames = new Set(env.TURNSTILE_HOSTNAMES.split(',').map((item) => item.trim()).filter(Boolean))
    return verification.success === true &&
      verification.action === expectedAction &&
      typeof verification.hostname === 'string' &&
      allowedHostnames.has(verification.hostname)
  } catch {
    return false
  }
}

async function getIntakeByPublicId(env: Env, publicId: string): Promise<RentalIntakeRecord | null> {
  return env.DB.prepare(`
    SELECT public_id, customer_name, customer_email, secondary_contact, checkout_token_hash,
      paypal_order_id, paypal_capture_id, payment_status, paid_at, discord_message_id,
      fulfillment_status, refund_status, admin_notes, updated_at, consent_at, created_at
    FROM rental_intakes WHERE public_id = ?1
  `).bind(publicId).first<RentalIntakeRecord>()
}

function discordPayload(intake: RentalIntakeRecord): Record<string, unknown> {
  const paid = intake.payment_status === 'completed'
  const paymentStatus = paid
    ? `✅ PayPal 결제 완료\nOrder: ${intake.paypal_order_id ?? '확인 중'}\nCapture: ${intake.paypal_capture_id ?? '확인 중'}`
    : '⏳ PayPal 결제 대기'

  const fields: DiscordEmbedField[] = [
    { name: '이름', value: intake.customer_name, inline: true },
    { name: '이메일', value: intake.customer_email, inline: true },
    { name: '보조 연락처', value: intake.secondary_contact ?? '없음', inline: false },
    { name: '고객정보 ID', value: intake.public_id, inline: true },
    { name: '개인정보 동의', value: '완료', inline: true },
    { name: '결제 상태', value: paymentStatus, inline: false },
  ]

  return {
    username: 'Campus Loop Intake',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: paid ? '✅ 결제 완료 · 침구 신청' : '🛏️ 새 침구 신청',
      color: paid ? 0x2f855a : 0x17332d,
      fields,
      timestamp: paid ? intake.paid_at : intake.created_at,
      footer: { text: paid ? 'Campus Loop · PayPal 자동 확인 완료' : 'Campus Loop · PayPal 결제 대기' },
    }],
  }
}

async function sendRentalIntakeToDiscord(env: Env, intake: RentalIntakeRecord): Promise<string> {
  const webhookUrl = new URL(env.DISCORD_WEBHOOK_URL)
  webhookUrl.searchParams.set('wait', 'true')

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordPayload(intake)),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Discord webhook failed')
  const message: unknown = await response.json()
  if (!isRecord(message) || typeof message.id !== 'string') throw new Error('Discord message ID was missing')
  return message.id
}

async function notifyRentalIntake(
  env: Env,
  publicId: string,
  requestId: string,
): Promise<void> {
  try {
    const intake = await getIntakeByPublicId(env, publicId)
    if (!intake) throw new Error('Rental intake was missing')
    const messageId = await sendRentalIntakeToDiscord(env, intake)
    await env.DB.prepare(`
      UPDATE rental_intakes SET discord_message_id = ?1 WHERE public_id = ?2
    `).bind(messageId, publicId).run()
    await syncDiscordPaymentStatus(env, publicId, requestId)
    console.log(JSON.stringify({ event: 'discord_rental_intake_sent', requestId, intakeId: publicId, status: 200 }))
  } catch {
    console.error(JSON.stringify({ event: 'discord_rental_intake_failed', requestId, intakeId: publicId, status: 502 }))
  }
}

async function syncDiscordPaymentStatus(env: Env, publicId: string, requestId: string): Promise<void> {
  try {
    const intake = await getIntakeByPublicId(env, publicId)
    if (!intake?.discord_message_id || intake.payment_status !== 'completed') return

    const webhookUrl = new URL(env.DISCORD_WEBHOOK_URL)
    webhookUrl.pathname = `${webhookUrl.pathname}/messages/${encodeURIComponent(intake.discord_message_id)}`
    const response = await fetch(webhookUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload(intake)),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('Discord message update failed')
    console.log(JSON.stringify({ event: 'discord_payment_status_synced', requestId, intakeId: publicId, status: 200 }))
  } catch {
    console.error(JSON.stringify({ event: 'discord_payment_status_failed', requestId, intakeId: publicId, status: 502 }))
  }
}

async function health(env: Env): Promise<Response> {
  try {
    await env.DB.prepare('SELECT 1').first()
    return Response.json({ status: 'ok', service: 'campus-loop-worker' })
  } catch {
    return errorResponse(503, 'database_unavailable', 'Service is temporarily unavailable.')
  }
}

async function createApplication(request: Request, env: Env, requestId: string): Promise<Response> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  }

  const parsed = await readLimitedJson(request)
  if (!parsed.ok) {
    return parsed.status === 413
      ? errorResponse(413, 'payload_too_large', 'Request body is too large.')
      : errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }
  if (!isRecord(parsed.value) || typeof parsed.value.turnstileToken !== 'string' ||
      parsed.value.turnstileToken.length < 1 || parsed.value.turnstileToken.length > 2048) {
    return errorResponse(403, 'turnstile_failed', 'Security verification failed.')
  }
  const input = validateApplication(parsed.value)
  if (!input) return errorResponse(422, 'invalid_application', 'Application fields are invalid.')
  if (!await verifyTurnstile(request, env, input.turnstileToken, TURNSTILE_ACTION)) {
    return errorResponse(403, 'turnstile_failed', 'Security verification failed.')
  }

  const now = new Date().toISOString()
  const publicId = `CLP-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  try {
    const result = await env.DB.prepare(`
      INSERT INTO pilot_applications (
        public_id, exchange_student_confirmed, housing, arrival_date, departure_date,
        applicant_name, applicant_email, consent_at, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    `).bind(
      publicId,
      1,
      input.housing,
      input.arrivalDate,
      input.departureDate,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      now,
      now,
    ).run()
    if (!result.success) throw new Error('D1 insert failed')
  } catch {
    console.error({ event: 'pilot_application_failed', requestId, status: 500 })
    return errorResponse(500, 'storage_failed', 'Application could not be saved.')
  }

  console.log({ event: 'pilot_application_received', requestId, applicationId: publicId, status: 201 })
  return Response.json({ id: publicId, status: 'received', createdAt: now }, { status: 201 })
}

async function createRentalIntake(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string,
): Promise<Response> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  }

  const parsed = await readLimitedJson(request)
  if (!parsed.ok) {
    return parsed.status === 413
      ? errorResponse(413, 'payload_too_large', 'Request body is too large.')
      : errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }
  if (!isRecord(parsed.value) || typeof parsed.value.turnstileToken !== 'string' ||
      parsed.value.turnstileToken.length < 1 || parsed.value.turnstileToken.length > 2048) {
    return errorResponse(403, 'turnstile_failed', 'Security verification failed.')
  }
  const input = validateRentalIntake(parsed.value)
  if (!input) return errorResponse(422, 'invalid_rental_intake', 'Customer fields are invalid.')
  if (!await verifyTurnstile(request, env, input.turnstileToken, RENTAL_TURNSTILE_ACTION)) {
    return errorResponse(403, 'turnstile_failed', 'Security verification failed.')
  }

  const now = new Date().toISOString()
  const publicId = `CLR-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  const checkoutTokenBytes = new Uint8Array(32)
  crypto.getRandomValues(checkoutTokenBytes)
  const checkoutToken = encodeBase64Url(checkoutTokenBytes)
  const checkoutTokenHash = await sha256(checkoutToken)
  try {
    const result = await env.DB.prepare(`
      INSERT INTO rental_intakes (
        public_id, customer_name, customer_email, secondary_contact, consent_at, created_at,
        checkout_token_hash, payment_status
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')
    `).bind(
      publicId,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      input.secondaryContact.trim() || null,
      now,
      now,
      checkoutTokenHash,
    ).run()
    if (!result.success) throw new Error('D1 insert failed')
  } catch {
    console.error({ event: 'rental_intake_failed', requestId, status: 500 })
    return errorResponse(500, 'storage_failed', 'Customer details could not be saved.')
  }

  console.log(JSON.stringify({ event: 'rental_intake_received', requestId, intakeId: publicId, status: 201 }))
  ctx.waitUntil(notifyRentalIntake(env, publicId, requestId))
  return Response.json({
    id: publicId,
    status: 'received',
    createdAt: now,
    checkoutToken,
    paypal: {
      clientId: env.PAYPAL_CLIENT_ID,
      environment: env.PAYPAL_ENVIRONMENT,
    },
  }, { status: 201 })
}

async function parseCheckoutAccessRequest(request: Request): Promise<CheckoutAccessInput | Response> {
  if (!isJsonRequest(request)) {
    return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  }
  const parsed = await readLimitedJson(request)
  if (!parsed.ok) {
    return parsed.status === 413
      ? errorResponse(413, 'payload_too_large', 'Request body is too large.')
      : errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }
  return validateCheckoutAccess(parsed.value) ?? errorResponse(422, 'invalid_checkout_access', 'Checkout access is invalid.')
}

async function createPayPalOrder(request: Request, env: Env, requestId: string): Promise<Response> {
  const parsed = await parseCheckoutAccessRequest(request)
  if (parsed instanceof Response) return parsed
  const intake = await getAuthorizedIntake(env, parsed)
  if (!intake) return errorResponse(404, 'checkout_not_found', 'Checkout could not be found.')
  if (intake.payment_status === 'completed') {
    return errorResponse(409, 'payment_already_completed', 'Payment has already been completed.')
  }
  if (intake.paypal_order_id) {
    return Response.json({ orderId: intake.paypal_order_id })
  }

  try {
    const accessToken = await getPayPalAccessToken(env)
    const response = await fetch(paypalUrl(env, '/v2/checkout/orders'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `create-${intake.public_id}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'campus-loop-bedding',
          custom_id: intake.public_id,
          invoice_id: intake.public_id,
          description: 'Campus Loop Essential Bedding Set — $15 refundable deposit included',
          amount: {
            currency_code: PAYPAL_CURRENCY,
            value: PAYPAL_AMOUNT,
            breakdown: {
              item_total: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_AMOUNT },
            },
          },
          items: [{
            name: 'Campus Loop Essential Bedding Set',
            description: 'Semester bedding rental with a $15 refundable deposit',
            sku: 'campus-loop-essential-bedding',
            quantity: '1',
            category: 'PHYSICAL_GOODS',
            unit_amount: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_AMOUNT },
            image_url: PAYPAL_PRODUCT_IMAGE_URL,
            url: PUBLIC_SITE_URL,
          }],
        }],
        application_context: {
          brand_name: 'Campus Loop',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('PayPal order creation failed')
    const order: unknown = await response.json()
    if (!isRecord(order) || typeof (order as PayPalOrderResponse).id !== 'string') {
      throw new Error('PayPal order ID was missing')
    }
    const orderId = (order as PayPalOrderResponse).id as string
    if (!/^[A-Z0-9]{8,32}$/.test(orderId)) throw new Error('PayPal order ID was invalid')

    const stored = await env.DB.prepare(`
      UPDATE rental_intakes
      SET paypal_order_id = ?1, payment_status = 'created'
      WHERE public_id = ?2 AND paypal_order_id IS NULL AND payment_status != 'completed'
    `).bind(orderId, intake.public_id).run()
    if (!stored.success) throw new Error('PayPal order could not be stored')

    const current = await getIntakeByPublicId(env, intake.public_id)
    if (!current?.paypal_order_id) throw new Error('Stored PayPal order was missing')
    console.log(JSON.stringify({ event: 'paypal_order_created', requestId, intakeId: intake.public_id, orderId: current.paypal_order_id, status: 201 }))
    return Response.json({ orderId: current.paypal_order_id }, { status: 201 })
  } catch {
    console.error(JSON.stringify({ event: 'paypal_order_create_failed', requestId, intakeId: intake.public_id, status: 502 }))
    return errorResponse(502, 'paypal_unavailable', 'PayPal checkout is temporarily unavailable.')
  }
}

function parseCompletedPayPalOrder(value: unknown, expectedAmount = PAYPAL_AMOUNT): PayPalCaptureDetails | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.status !== 'COMPLETED') return null
  if (!Array.isArray(value.purchase_units) || value.purchase_units.length !== 1) return null
  const purchaseUnit = value.purchase_units[0]
  if (!isRecord(purchaseUnit) || typeof purchaseUnit.custom_id !== 'string') return null
  if (!isRecord(purchaseUnit.payments) || !Array.isArray(purchaseUnit.payments.captures) || purchaseUnit.payments.captures.length < 1) return null
  const capture = purchaseUnit.payments.captures.find((candidate) => isRecord(candidate) && candidate.status === 'COMPLETED')
  if (!isRecord(capture) || typeof capture.id !== 'string' || !isRecord(capture.amount)) return null
  if (capture.amount.currency_code !== PAYPAL_CURRENCY || capture.amount.value !== expectedAmount) return null
  return {
    orderId: value.id,
    captureId: capture.id,
    customId: purchaseUnit.custom_id,
    status: 'COMPLETED',
  }
}

async function fetchPayPalOrder(env: Env, accessToken: string, orderId: string): Promise<unknown> {
  const response = await fetch(paypalUrl(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('PayPal order lookup failed')
  return response.json()
}

async function capturePayPalOrder(env: Env, orderId: string, expectedAmount = PAYPAL_AMOUNT): Promise<PayPalCaptureDetails> {
  const accessToken = await getPayPalAccessToken(env)
  const response = await fetch(paypalUrl(env, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `capture-${orderId}`,
      Prefer: 'return=representation',
    },
    signal: AbortSignal.timeout(10_000),
  })
  const order = response.ok ? await response.json() : await fetchPayPalOrder(env, accessToken, orderId)
  const details = parseCompletedPayPalOrder(order, expectedAmount)
  if (!details || details.orderId !== orderId) throw new Error('PayPal capture was not completed')
  return details
}

async function recordPaymentCompleted(env: Env, details: PayPalCaptureDetails): Promise<boolean> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    UPDATE rental_intakes
    SET paypal_capture_id = ?1, payment_status = 'completed', paid_at = COALESCE(paid_at, ?2)
    WHERE public_id = ?3 AND paypal_order_id = ?4
  `).bind(details.captureId, now, details.customId, details.orderId).run()
  return result.success && (result.meta.changes ?? 0) > 0
}

async function captureOrder(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string,
  orderId: string,
): Promise<Response> {
  const parsed = await parseCheckoutAccessRequest(request)
  if (parsed instanceof Response) return parsed
  const intake = await getAuthorizedIntake(env, parsed)
  if (!intake || intake.paypal_order_id !== orderId) {
    return errorResponse(404, 'checkout_not_found', 'Checkout could not be found.')
  }
  if (intake.payment_status === 'completed') {
    return Response.json({ orderId, status: 'COMPLETED' })
  }

  try {
    const details = await capturePayPalOrder(env, orderId)
    if (details.customId !== intake.public_id || !await recordPaymentCompleted(env, details)) {
      throw new Error('Captured order did not match the checkout')
    }
    ctx.waitUntil(syncDiscordPaymentStatus(env, intake.public_id, requestId))
    console.log(JSON.stringify({ event: 'paypal_capture_completed', requestId, intakeId: intake.public_id, orderId, status: 200 }))
    return Response.json({ orderId, status: 'COMPLETED' })
  } catch {
    console.error(JSON.stringify({ event: 'paypal_capture_failed', requestId, intakeId: intake.public_id, orderId, status: 502 }))
    return errorResponse(502, 'payment_not_completed', 'PayPal payment could not be completed.')
  }
}

function parsePayPalWebhookEvent(value: unknown): PayPalWebhookEvent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length > 100) return null
  if (typeof value.event_type !== 'string' || value.event_type.length > 100) return null
  if (!isRecord(value.resource)) return null
  return { id: value.id, event_type: value.event_type, resource: value.resource }
}

function webhookHeader(request: Request, name: string, maxLength: number): string | null {
  const value = request.headers.get(name)
  return value && value.length <= maxLength ? value : null
}

async function verifyPayPalWebhook(env: Env, request: Request, event: PayPalWebhookEvent): Promise<boolean> {
  const authAlgo = webhookHeader(request, 'PAYPAL-AUTH-ALGO', 100)
  const certUrl = webhookHeader(request, 'PAYPAL-CERT-URL', 500)
  const transmissionId = webhookHeader(request, 'PAYPAL-TRANSMISSION-ID', 100)
  const transmissionSig = webhookHeader(request, 'PAYPAL-TRANSMISSION-SIG', 500)
  const transmissionTime = webhookHeader(request, 'PAYPAL-TRANSMISSION-TIME', 100)
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return false

  const accessToken = await getPayPalAccessToken(env)
  const response = await fetch(paypalUrl(env, '/v1/notifications/verify-webhook-signature'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return false
  const verification: unknown = await response.json()
  return isRecord(verification) && verification.verification_status === 'SUCCESS'
}

function parseCompletedWebhookResource(
  resource: Record<string, unknown>,
  customId: string,
  expectedAmount = PAYPAL_AMOUNT,
): PayPalCaptureDetails | null {
  if (resource.status !== 'COMPLETED' || typeof resource.id !== 'string' || !isRecord(resource.amount)) return null
  if (resource.amount.currency_code !== PAYPAL_CURRENCY || resource.amount.value !== expectedAmount) return null
  if (!isRecord(resource.supplementary_data) || !isRecord(resource.supplementary_data.related_ids)) return null
  const orderId = resource.supplementary_data.related_ids.order_id
  if (typeof orderId !== 'string') return null
  return { orderId, captureId: resource.id, customId, status: 'COMPLETED' }
}

async function handlePayPalWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string,
): Promise<Response> {
  if (!isJsonRequest(request)) return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  const parsed = await readLimitedJson(request, MAX_WEBHOOK_BODY_BYTES)
  if (!parsed.ok) return errorResponse(parsed.status, 'invalid_webhook', 'Webhook payload is invalid.')
  const event = parsePayPalWebhookEvent(parsed.value)
  if (!event) return errorResponse(400, 'invalid_webhook', 'Webhook payload is invalid.')

  try {
    if (!await verifyPayPalWebhook(env, request, event)) {
      return errorResponse(401, 'invalid_webhook_signature', 'Webhook signature is invalid.')
    }
    await env.DB.prepare(`
      INSERT OR IGNORE INTO paypal_webhook_events (event_id, event_type, received_at)
      VALUES (?1, ?2, ?3)
    `).bind(event.id, event.event_type, new Date().toISOString()).run()

    if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return new Response(null, { status: 204 })
    const orderId = isRecord(event.resource.supplementary_data) && isRecord(event.resource.supplementary_data.related_ids)
      ? event.resource.supplementary_data.related_ids.order_id
      : null
    if (typeof orderId !== 'string') return errorResponse(400, 'invalid_webhook', 'Webhook payload is invalid.')
    const intake = await env.DB.prepare(`
      SELECT public_id FROM rental_intakes WHERE paypal_order_id = ?1
    `).bind(orderId).first<{ public_id: string }>()
    if (!intake) {
      const test = await env.DB.prepare(`
        SELECT id FROM admin_paypal_tests WHERE paypal_order_id = ?1
      `).bind(orderId).first<{ id: string }>()
      if (!test) {
        console.error(JSON.stringify({ event: 'paypal_webhook_unmatched', requestId, orderId, status: 202 }))
        return new Response(null, { status: 202 })
      }
      const details = parseCompletedWebhookResource(event.resource, test.id, PAYPAL_TEST_AMOUNT)
      if (!details || !await recordAdminPayPalTestCompleted(env, details)) {
        return errorResponse(400, 'invalid_webhook', 'Webhook payment details are invalid.')
      }
      console.log(JSON.stringify({ event: 'paypal_admin_test_webhook_completed', requestId, testId: test.id, orderId, status: 204 }))
      return new Response(null, { status: 204 })
    }
    const details = parseCompletedWebhookResource(event.resource, intake.public_id)
    if (!details || !await recordPaymentCompleted(env, details)) {
      return errorResponse(400, 'invalid_webhook', 'Webhook payment details are invalid.')
    }
    ctx.waitUntil(syncDiscordPaymentStatus(env, intake.public_id, requestId))
    console.log(JSON.stringify({ event: 'paypal_webhook_completed', requestId, intakeId: intake.public_id, orderId, status: 204 }))
    return new Response(null, { status: 204 })
  } catch {
    console.error(JSON.stringify({ event: 'paypal_webhook_failed', requestId, status: 503 }))
    return errorResponse(503, 'webhook_processing_failed', 'Webhook could not be processed.')
  }
}

function publicAdminIntake(intake: RentalIntakeRecord): Record<string, unknown> {
  return {
    id: intake.public_id,
    customerName: intake.customer_name,
    customerEmail: intake.customer_email,
    secondaryContact: intake.secondary_contact,
    paypalOrderId: intake.paypal_order_id,
    paypalCaptureId: intake.paypal_capture_id,
    paymentStatus: intake.payment_status,
    paidAt: intake.paid_at,
    fulfillmentStatus: intake.fulfillment_status,
    refundStatus: intake.refund_status,
    adminNotes: intake.admin_notes,
    consentAt: intake.consent_at,
    createdAt: intake.created_at,
    updatedAt: intake.updated_at,
  }
}

function validateAdminUpdate(value: unknown): AdminUpdateInput | null {
  if (!isRecord(value)) return null
  const allowed = new Set([
    'customerName', 'customerEmail', 'secondaryContact', 'paymentStatus',
    'fulfillmentStatus', 'refundStatus', 'adminNotes',
  ])
  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null
  if ('customerName' in value && (typeof value.customerName !== 'string' || value.customerName.trim().length < 1 || value.customerName.trim().length > 120)) return null
  if ('customerEmail' in value && (typeof value.customerEmail !== 'string' || value.customerEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.customerEmail))) return null
  if ('secondaryContact' in value && value.secondaryContact !== null && (typeof value.secondaryContact !== 'string' || value.secondaryContact.trim().length > 160)) return null
  if ('paymentStatus' in value && (typeof value.paymentStatus !== 'string' || !PAYMENT_STATUSES.has(value.paymentStatus))) return null
  if ('fulfillmentStatus' in value && (typeof value.fulfillmentStatus !== 'string' || !FULFILLMENT_STATUSES.has(value.fulfillmentStatus))) return null
  if ('refundStatus' in value && (typeof value.refundStatus !== 'string' || !REFUND_STATUSES.has(value.refundStatus))) return null
  if ('adminNotes' in value && (typeof value.adminNotes !== 'string' || value.adminNotes.length > 2000)) return null
  return {
    ...value,
    ...('customerName' in value ? { customerName: (value.customerName as string).trim() } : {}),
    ...('customerEmail' in value ? { customerEmail: (value.customerEmail as string).trim().toLowerCase() } : {}),
    ...('secondaryContact' in value ? { secondaryContact: value.secondaryContact === null ? null : (value.secondaryContact as string).trim() || null } : {}),
  } as AdminUpdateInput
}

async function adminLoginKey(request: Request, env: Env): Promise<string> {
  const remoteAddress = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  return sha256(`${env.ADMIN_SESSION_SECRET}:${remoteAddress}`)
}

async function getAdminLoginAttempt(env: Env, keyHash: string): Promise<AdminLoginAttempt | null> {
  return env.DB.prepare(`
    SELECT window_started_at, failed_count, locked_until
    FROM admin_login_attempts WHERE key_hash = ?1
  `).bind(keyHash).first<AdminLoginAttempt>()
}

async function recordAdminLoginFailure(env: Env, keyHash: string): Promise<AdminLoginAttempt> {
  const now = Math.floor(Date.now() / 1000)
  const current = await getAdminLoginAttempt(env, keyHash)
  const inWindow = current !== null && now - current.window_started_at < ADMIN_LOGIN_WINDOW_SECONDS
  const failedCount = inWindow ? current.failed_count + 1 : 1
  const windowStartedAt = inWindow ? current.window_started_at : now
  const lockedUntil = failedCount >= ADMIN_LOGIN_MAX_FAILURES ? now + ADMIN_LOGIN_WINDOW_SECONDS : 0
  await env.DB.prepare(`
    INSERT INTO admin_login_attempts (key_hash, window_started_at, failed_count, locked_until)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(key_hash) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      failed_count = excluded.failed_count,
      locked_until = excluded.locked_until
  `).bind(keyHash, windowStartedAt, failedCount, lockedUntil).run()
  return { window_started_at: windowStartedAt, failed_count: failedCount, locked_until: lockedUntil }
}

async function loginAdmin(request: Request, env: Env): Promise<Response> {
  if (!hasTrustedOrigin(request)) return errorResponse(403, 'untrusted_origin', 'Request origin is not allowed.')
  if (!isJsonRequest(request)) return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  const parsed = await readLimitedJson(request, MAX_ADMIN_BODY_BYTES)
  if (!parsed.ok) return errorResponse(parsed.status, 'invalid_login', 'Login request is invalid.')
  if (!isRecord(parsed.value) || Object.keys(parsed.value).some((key) => key !== 'username' && key !== 'password') ||
      typeof parsed.value.username !== 'string' || parsed.value.username.length > 120 ||
      typeof parsed.value.password !== 'string' || parsed.value.password.length < 1 || parsed.value.password.length > 1024) {
    return errorResponse(422, 'invalid_login', 'Login request is invalid.')
  }

  const keyHash = await adminLoginKey(request, env)
  const current = await getAdminLoginAttempt(env, keyHash)
  const now = Math.floor(Date.now() / 1000)
  if (current && current.locked_until > now) {
    return Response.json({ error: { code: 'login_rate_limited', message: 'Too many login attempts. Try again later.' } }, {
      status: 429,
      headers: { 'Retry-After': String(current.locked_until - now) },
    })
  }

  const passwordMatches = await verifyAdminPassword(parsed.value.password, env.ADMIN_PASSWORD_HASH)
  const usernameMatches = constantTimeStringEqual(parsed.value.username, env.ADMIN_USERNAME)
  if (!passwordMatches || !usernameMatches) {
    const attempt = await recordAdminLoginFailure(env, keyHash)
    if (attempt.locked_until > now) {
      return Response.json({ error: { code: 'login_rate_limited', message: 'Too many login attempts. Try again later.' } }, {
        status: 429,
        headers: { 'Retry-After': String(attempt.locked_until - now) },
      })
    }
    return errorResponse(401, 'invalid_credentials', 'Username or password is incorrect.')
  }

  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE key_hash = ?1').bind(keyHash).run()
  const { session, cookie } = await createAdminSession(env)
  return Response.json({
    authenticated: true,
    username: session.username,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  }, { headers: { 'Set-Cookie': cookie } })
}

function adminSessionResponse(session: AdminSession): Response {
  return Response.json({
    authenticated: true,
    username: session.username,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  })
}

async function adminOverview(env: Env): Promise<Response> {
  const overview = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN payment_status = 'completed' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN fulfillment_status = 'ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN fulfillment_status = 'collected' THEN 1 ELSE 0 END) AS collected,
      SUM(CASE WHEN fulfillment_status = 'returned' THEN 1 ELSE 0 END) AS returned,
      SUM(CASE WHEN refund_status = 'pending' THEN 1 ELSE 0 END) AS refunds_pending,
      SUM(CASE WHEN refund_status = 'completed' THEN 1 ELSE 0 END) AS refunds_completed
    FROM rental_intakes
  `).first<Record<string, number | null>>()
  return Response.json({
    total: overview?.total ?? 0,
    paid: overview?.paid ?? 0,
    ready: overview?.ready ?? 0,
    collected: overview?.collected ?? 0,
    returned: overview?.returned ?? 0,
    refundsPending: overview?.refunds_pending ?? 0,
    refundsCompleted: overview?.refunds_completed ?? 0,
  })
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

async function listAdminIntakes(env: Env, url: URL): Promise<Response> {
  const query = (url.searchParams.get('q') ?? '').trim()
  const paymentStatus = url.searchParams.get('paymentStatus') ?? ''
  const fulfillmentStatus = url.searchParams.get('fulfillmentStatus') ?? ''
  const refundStatus = url.searchParams.get('refundStatus') ?? ''
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 100)
  const offset = Math.min(Math.max(Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0), 10_000)
  if (query.length > 160 || (paymentStatus && !PAYMENT_STATUSES.has(paymentStatus)) ||
      (fulfillmentStatus && !FULFILLMENT_STATUSES.has(fulfillmentStatus)) ||
      (refundStatus && !REFUND_STATUSES.has(refundStatus))) {
    return errorResponse(422, 'invalid_filters', 'Admin filters are invalid.')
  }

  const clauses: string[] = []
  const bindings: unknown[] = []
  if (query) {
    bindings.push(`%${escapeLike(query)}%`)
    const position = bindings.length
    clauses.push(`(public_id LIKE ?${position} ESCAPE '\\' OR customer_name LIKE ?${position} ESCAPE '\\' OR customer_email LIKE ?${position} ESCAPE '\\' OR COALESCE(secondary_contact, '') LIKE ?${position} ESCAPE '\\')`)
  }
  for (const [column, value] of [['payment_status', paymentStatus], ['fulfillment_status', fulfillmentStatus], ['refund_status', refundStatus]]) {
    if (value) {
      bindings.push(value)
      clauses.push(`${column} = ?${bindings.length}`)
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM rental_intakes ${where}`).bind(...bindings).first<{ total: number }>()
  const results = await env.DB.prepare(`
    SELECT public_id, customer_name, customer_email, secondary_contact, checkout_token_hash,
      paypal_order_id, paypal_capture_id, payment_status, paid_at, discord_message_id,
      fulfillment_status, refund_status, admin_notes, updated_at, consent_at, created_at
    FROM rental_intakes ${where}
    ORDER BY created_at DESC
    LIMIT ?${bindings.length + 1} OFFSET ?${bindings.length + 2}
  `).bind(...bindings, limit, offset).all<RentalIntakeRecord>()
  return Response.json({ items: results.results.map(publicAdminIntake), total: count?.total ?? 0, limit, offset })
}

async function updateAdminIntake(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string,
  session: AdminSession,
  publicId: string,
): Promise<Response> {
  if (!isJsonRequest(request)) return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  const parsed = await readLimitedJson(request, MAX_ADMIN_BODY_BYTES)
  if (!parsed.ok) return errorResponse(parsed.status, 'invalid_update', 'Update request is invalid.')
  const input = validateAdminUpdate(parsed.value)
  if (!input) return errorResponse(422, 'invalid_update', 'Update fields are invalid.')
  const existing = await getIntakeByPublicId(env, publicId)
  if (!existing) return errorResponse(404, 'intake_not_found', 'Rental intake was not found.')

  const columnMap: Record<keyof AdminUpdateInput, string> = {
    customerName: 'customer_name',
    customerEmail: 'customer_email',
    secondaryContact: 'secondary_contact',
    paymentStatus: 'payment_status',
    fulfillmentStatus: 'fulfillment_status',
    refundStatus: 'refund_status',
    adminNotes: 'admin_notes',
  }
  const entries = Object.entries(input) as [keyof AdminUpdateInput, AdminUpdateInput[keyof AdminUpdateInput]][]
  const values = entries.map(([, value]) => value)
  const assignments = entries.map(([key], index) => `${columnMap[key]} = ?${index + 1}`)
  const now = new Date().toISOString()
  values.push(now)
  assignments.push(`updated_at = ?${values.length}`)
  if (input.paymentStatus === 'completed' && !existing.paid_at) assignments.push(`paid_at = ?${values.length}`)

  const before = publicAdminIntake(existing)
  const after: Record<string, unknown> = { ...before, ...input, updatedAt: now }
  if (input.paymentStatus === 'completed' && !existing.paid_at) after.paidAt = now
  const updateStatement = env.DB.prepare(`
    UPDATE rental_intakes SET ${assignments.join(', ')}
    WHERE public_id = ?${values.length + 1}
  `).bind(...values, publicId)
  const auditStatement = env.DB.prepare(`
    INSERT INTO admin_audit_log (intake_public_id, actor, action, before_json, after_json, created_at)
    VALUES (?1, ?2, 'update', ?3, ?4, ?5)
  `).bind(publicId, session.username, JSON.stringify(before), JSON.stringify(after), now)
  const results = await env.DB.batch([updateStatement, auditStatement])
  if (results.some((result) => !result.success)) return errorResponse(500, 'storage_failed', 'Update could not be saved.')

  const updated = await getIntakeByPublicId(env, publicId)
  if (!updated) return errorResponse(500, 'storage_failed', 'Updated intake could not be loaded.')
  if (existing.payment_status !== 'completed' && updated.payment_status === 'completed') {
    ctx.waitUntil(syncDiscordPaymentStatus(env, publicId, requestId))
  }
  console.log(JSON.stringify({ event: 'admin_intake_updated', requestId, intakeId: publicId, actor: session.username, status: 200 }))
  return Response.json({ item: publicAdminIntake(updated) })
}

async function listAdminAudit(env: Env, url: URL): Promise<Response> {
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50
  const limit = Math.min(Math.max(requestedLimit, 1), 100)
  const results = await env.DB.prepare(`
    SELECT id, intake_public_id, actor, action, before_json, after_json, created_at
    FROM admin_audit_log ORDER BY created_at DESC LIMIT ?1
  `).bind(limit).all<AdminAuditRecord>()
  return Response.json({
    items: results.results.map((record) => ({
      id: record.id,
      intakeId: record.intake_public_id,
      actor: record.actor,
      action: record.action,
      before: JSON.parse(record.before_json),
      after: JSON.parse(record.after_json),
      createdAt: record.created_at,
    })),
  })
}

function publicAdminPayPalTest(record: AdminPayPalTestRecord): Record<string, unknown> {
  return {
    id: record.id,
    paypalOrderId: record.paypal_order_id,
    paypalCaptureId: record.paypal_capture_id,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    createdBy: record.created_by,
    createdAt: record.created_at,
    paidAt: record.paid_at,
  }
}

async function listAdminPayPalTests(env: Env): Promise<Response> {
  const tests = await env.DB.prepare(`
    SELECT id, paypal_order_id, paypal_capture_id, status, amount, currency,
      created_by, created_at, paid_at
    FROM admin_paypal_tests ORDER BY created_at DESC LIMIT 20
  `).all<AdminPayPalTestRecord>()
  return Response.json({ items: tests.results.map(publicAdminPayPalTest) })
}

async function createAdminPayPalTestOrder(
  env: Env,
  session: AdminSession,
  requestId: string,
): Promise<Response> {
  const testId = `CLT-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  const now = new Date().toISOString()
  try {
    const accessToken = await getPayPalAccessToken(env)
    const response = await fetch(paypalUrl(env, '/v2/checkout/orders'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `admin-test-${testId}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'campus-loop-admin-test',
          custom_id: testId,
          invoice_id: testId,
          description: 'Campus Loop $1 checkout verification',
          amount: {
            currency_code: PAYPAL_CURRENCY,
            value: PAYPAL_TEST_AMOUNT,
            breakdown: {
              item_total: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_TEST_AMOUNT },
            },
          },
          items: [{
            name: 'Campus Loop Checkout Verification',
            description: 'Admin-only live payment flow test; no bedding order is created',
            sku: 'campus-loop-admin-checkout-test',
            quantity: '1',
            unit_amount: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_TEST_AMOUNT },
            url: `${PUBLIC_SITE_URL}admin`,
          }],
        }],
        application_context: {
          brand_name: 'Campus Loop',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const order: unknown = await response.json()
    if (!response.ok || !isRecord(order) || typeof order.id !== 'string' || !/^[A-Z0-9]{8,32}$/.test(order.id)) {
      throw new Error('PayPal test order was not created')
    }
    const result = await env.DB.prepare(`
      INSERT INTO admin_paypal_tests (
        id, paypal_order_id, status, amount, currency, created_by, created_at
      ) VALUES (?1, ?2, 'created', ?3, ?4, ?5, ?6)
    `).bind(testId, order.id, PAYPAL_TEST_AMOUNT, PAYPAL_CURRENCY, session.username, now).run()
    if (!result.success) throw new Error('PayPal test order was not stored')
    console.log(JSON.stringify({ event: 'paypal_admin_test_order_created', requestId, testId, orderId: order.id, status: 201 }))
    return Response.json({ orderId: order.id, testId }, { status: 201 })
  } catch {
    console.error(JSON.stringify({ event: 'paypal_admin_test_order_failed', requestId, testId, status: 502 }))
    return errorResponse(502, 'paypal_unavailable', 'PayPal test checkout is temporarily unavailable.')
  }
}

async function recordAdminPayPalTestCompleted(env: Env, details: PayPalCaptureDetails): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE admin_paypal_tests
    SET paypal_capture_id = ?1, status = 'completed', paid_at = COALESCE(paid_at, ?2)
    WHERE id = ?3 AND paypal_order_id = ?4
  `).bind(details.captureId, new Date().toISOString(), details.customId, details.orderId).run()
  return result.success && (result.meta.changes ?? 0) > 0
}

async function captureAdminPayPalTestOrder(
  env: Env,
  requestId: string,
  orderId: string,
): Promise<Response> {
  const test = await env.DB.prepare(`
    SELECT id, paypal_order_id, paypal_capture_id, status, amount, currency,
      created_by, created_at, paid_at
    FROM admin_paypal_tests WHERE paypal_order_id = ?1
  `).bind(orderId).first<AdminPayPalTestRecord>()
  if (!test) return errorResponse(404, 'paypal_test_not_found', 'PayPal test order was not found.')
  if (test.status === 'completed') return Response.json({ orderId, testId: test.id, status: 'COMPLETED' })
  try {
    const details = await capturePayPalOrder(env, orderId, PAYPAL_TEST_AMOUNT)
    if (details.customId !== test.id || !await recordAdminPayPalTestCompleted(env, details)) {
      throw new Error('Captured PayPal test order did not match')
    }
    console.log(JSON.stringify({ event: 'paypal_admin_test_capture_completed', requestId, testId: test.id, orderId, status: 200 }))
    return Response.json({ orderId, testId: test.id, status: 'COMPLETED' })
  } catch {
    console.error(JSON.stringify({ event: 'paypal_admin_test_capture_failed', requestId, testId: test.id, orderId, status: 502 }))
    return errorResponse(502, 'payment_not_completed', 'PayPal test payment could not be completed.')
  }
}

async function handleAdminRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string,
  url: URL,
): Promise<Response> {
  if (url.pathname === ADMIN_LOGIN_PATH) {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    return loginAdmin(request, env)
  }

  const session = await getAdminSession(request, env)
  if (!session) return errorResponse(401, 'authentication_required', 'Administrator login is required.')
  if (url.pathname === ADMIN_SESSION_PATH) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    return adminSessionResponse(session)
  }
  if (url.pathname === ADMIN_LOGOUT_PATH) {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    if (!hasTrustedOrigin(request) || !hasValidCsrf(request, session)) return errorResponse(403, 'csrf_failed', 'Security validation failed.')
    return Response.json({ authenticated: false }, {
      headers: { 'Set-Cookie': `${ADMIN_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` },
    })
  }
  if (url.pathname === ADMIN_OVERVIEW_PATH) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    return adminOverview(env)
  }
  if (url.pathname === ADMIN_PAYPAL_CONFIG_PATH) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    return Response.json({ clientId: env.PAYPAL_CLIENT_ID, environment: env.PAYPAL_ENVIRONMENT })
  }
  if (url.pathname === ADMIN_PAYPAL_TEST_ORDERS_PATH) {
    if (request.method === 'GET') return listAdminPayPalTests(env)
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    if (!hasTrustedOrigin(request) || !hasValidCsrf(request, session)) return errorResponse(403, 'csrf_failed', 'Security validation failed.')
    return createAdminPayPalTestOrder(env, session, requestId)
  }
  const testCaptureMatch = url.pathname.match(ADMIN_PAYPAL_TEST_CAPTURE_PATH)
  if (testCaptureMatch) {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    if (!hasTrustedOrigin(request) || !hasValidCsrf(request, session)) return errorResponse(403, 'csrf_failed', 'Security validation failed.')
    return captureAdminPayPalTestOrder(env, requestId, testCaptureMatch[1])
  }
  if (url.pathname === ADMIN_INTAKES_PATH) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    return listAdminIntakes(env, url)
  }
  const intakeMatch = url.pathname.match(ADMIN_INTAKE_PATH)
  if (intakeMatch) {
    if (request.method !== 'PATCH') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    if (!hasTrustedOrigin(request) || !hasValidCsrf(request, session)) return errorResponse(403, 'csrf_failed', 'Security validation failed.')
    return updateAdminIntake(request, env, ctx, requestId, session, intakeMatch[1])
  }
  if (url.pathname === ADMIN_AUDIT_PATH) {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
    return listAdminAudit(env, url)
  }
  return errorResponse(404, 'not_found', 'Admin route not found.')
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const requestId = crypto.randomUUID()

    if (ADMIN_PAGE_PATH.test(url.pathname)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return adminPageResponse(await env.ASSETS.fetch(request))
    }
    if (url.pathname.startsWith('/api/v1/admin')) {
      return adminApiResponse(await handleAdminRequest(request, env, ctx, requestId, url))
    }

    if (url.pathname === HEALTH_PATH) {
      if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return health(env)
    }
    if (url.pathname === APPLICATION_PATH) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return createApplication(request, env, requestId)
    }
    if (url.pathname === RENTAL_INTAKE_PATH) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      if (!SALES_OPEN) return soldOutResponse()
      return createRentalIntake(request, env, ctx, requestId)
    }
    if (url.pathname === PAYPAL_ORDERS_PATH) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      if (!SALES_OPEN) return soldOutResponse()
      return createPayPalOrder(request, env, requestId)
    }
    const captureMatch = url.pathname.match(PAYPAL_CAPTURE_PATH)
    if (captureMatch) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      if (!SALES_OPEN) return soldOutResponse()
      return captureOrder(request, env, ctx, requestId, captureMatch[1])
    }
    if (url.pathname === PAYPAL_WEBHOOK_PATH) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return handlePayPalWebhook(request, env, ctx, requestId)
    }
    return errorResponse(404, 'not_found', 'API route not found.')
  },
} satisfies ExportedHandler<Env>
