const BASE = '/api/v1/admin'

async function request(path, options = {}) {
  const response = await window.fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error?.message || '요청을 처리하지 못했습니다.')
    error.status = response.status
    error.code = data?.error?.code
    throw error
  }
  return data
}

export const adminApi = {
  session: () => request('/session'),
  login: (username, password) => request('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  logout: (csrfToken) => request('/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  }),
  overview: () => request('/overview'),
  intakes: (filters) => request(`/intakes?${new window.URLSearchParams(filters)}`),
  audit: () => request('/audit?limit=50'),
  paypalConfig: () => request('/paypal/config'),
  paypalTests: () => request('/paypal/test-orders'),
  createPayPalTestOrder: (csrfToken) => request('/paypal/test-orders', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  }),
  capturePayPalTestOrder: (orderId, csrfToken) => request(`/paypal/test-orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  }),
  updateIntake: (id, update, csrfToken) => request(`/intakes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(update),
  }),
}
