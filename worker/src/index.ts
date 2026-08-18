const APPLICATION_PATH = '/api/v1/pilot-applications'
const HEALTH_PATH = '/api/v1/health'
const MAX_BODY_BYTES = 16 * 1024
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'pilot_application'

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

type TurnstileResult = {
  success?: boolean
  action?: string
  hostname?: string
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

async function readLimitedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number }> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return { ok: false, status: 413 }
  if (!request.body) return { ok: false, status: 400 }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_BODY_BYTES) {
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

async function verifyTurnstile(request: Request, env: Env, token: string): Promise<boolean> {
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
      verification.action === TURNSTILE_ACTION &&
      typeof verification.hostname === 'string' &&
      allowedHostnames.has(verification.hostname)
  } catch {
    return false
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
  if (!await verifyTurnstile(request, env, input.turnstileToken)) {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
    return errorResponse(404, 'not_found', 'API route not found.')
  },
} satisfies ExportedHandler<Env>
