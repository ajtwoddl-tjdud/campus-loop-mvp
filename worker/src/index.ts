const APPLICATION_PATH = '/api/v1/pilot-applications'
const RENTAL_INTAKE_PATH = '/api/v1/rental-intakes'
const HEALTH_PATH = '/api/v1/health'
const PAYPAL_ORDERS_PATH = '/api/v1/paypal/orders'
const PAYPAL_WEBHOOK_PATH = '/api/v1/paypal/webhooks'
const PAYPAL_CAPTURE_PATH = /^\/api\/v1\/paypal\/orders\/([A-Z0-9]{8,32})\/capture$/
const MAX_BODY_BYTES = 16 * 1024
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'pilot_application'
const RENTAL_TURNSTILE_ACTION = 'rental_intake'
const PAYPAL_AMOUNT = '49.99'
const PAYPAL_CURRENCY = 'USD'

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
  consent_at: string
  created_at: string
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
  intakeId: string
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
      consent_at, created_at
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
      consent_at, created_at
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
          amount: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_AMOUNT },
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

function parseCompletedPayPalOrder(value: unknown): PayPalCaptureDetails | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.status !== 'COMPLETED') return null
  if (!Array.isArray(value.purchase_units) || value.purchase_units.length !== 1) return null
  const purchaseUnit = value.purchase_units[0]
  if (!isRecord(purchaseUnit) || typeof purchaseUnit.custom_id !== 'string') return null
  if (!isRecord(purchaseUnit.payments) || !Array.isArray(purchaseUnit.payments.captures) || purchaseUnit.payments.captures.length < 1) return null
  const capture = purchaseUnit.payments.captures.find((candidate) => isRecord(candidate) && candidate.status === 'COMPLETED')
  if (!isRecord(capture) || typeof capture.id !== 'string' || !isRecord(capture.amount)) return null
  if (capture.amount.currency_code !== PAYPAL_CURRENCY || capture.amount.value !== PAYPAL_AMOUNT) return null
  return {
    orderId: value.id,
    captureId: capture.id,
    intakeId: purchaseUnit.custom_id,
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

async function capturePayPalOrder(env: Env, orderId: string): Promise<PayPalCaptureDetails> {
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
  const details = parseCompletedPayPalOrder(order)
  if (!details || details.orderId !== orderId) throw new Error('PayPal capture was not completed')
  return details
}

async function recordPaymentCompleted(env: Env, details: PayPalCaptureDetails): Promise<boolean> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    UPDATE rental_intakes
    SET paypal_capture_id = ?1, payment_status = 'completed', paid_at = COALESCE(paid_at, ?2)
    WHERE public_id = ?3 AND paypal_order_id = ?4
  `).bind(details.captureId, now, details.intakeId, details.orderId).run()
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
    if (details.intakeId !== intake.public_id || !await recordPaymentCompleted(env, details)) {
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

function parseCompletedWebhookResource(resource: Record<string, unknown>, intakeId: string): PayPalCaptureDetails | null {
  if (resource.status !== 'COMPLETED' || typeof resource.id !== 'string' || !isRecord(resource.amount)) return null
  if (resource.amount.currency_code !== PAYPAL_CURRENCY || resource.amount.value !== PAYPAL_AMOUNT) return null
  if (!isRecord(resource.supplementary_data) || !isRecord(resource.supplementary_data.related_ids)) return null
  const orderId = resource.supplementary_data.related_ids.order_id
  if (typeof orderId !== 'string') return null
  return { orderId, captureId: resource.id, intakeId, status: 'COMPLETED' }
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
      console.error(JSON.stringify({ event: 'paypal_webhook_unmatched', requestId, orderId, status: 202 }))
      return new Response(null, { status: 202 })
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const requestId = crypto.randomUUID()

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
      return createRentalIntake(request, env, ctx, requestId)
    }
    if (url.pathname === PAYPAL_ORDERS_PATH) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return createPayPalOrder(request, env, requestId)
    }
    const captureMatch = url.pathname.match(PAYPAL_CAPTURE_PATH)
    if (captureMatch) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return captureOrder(request, env, ctx, requestId, captureMatch[1])
    }
    if (url.pathname === PAYPAL_WEBHOOK_PATH) {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.')
      return handlePayPalWebhook(request, env, ctx, requestId)
    }
    return errorResponse(404, 'not_found', 'API route not found.')
  },
} satisfies ExportedHandler<Env>
