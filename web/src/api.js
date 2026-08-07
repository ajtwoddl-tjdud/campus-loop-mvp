const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/$/, '')

export const reservationApiEnabled = Boolean(API_BASE_URL)

export async function createReservation(payload) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is required in production')
  }

  const response = await window.fetch(`${API_BASE_URL}/api/v1/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Reservation request failed with status ${response.status}`)
  }

  return response.json()
}
