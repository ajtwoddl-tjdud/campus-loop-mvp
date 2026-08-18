export async function createPilotApplication(payload) {
  const response = await window.fetch('/api/v1/pilot-applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Pilot application failed with status ${response.status}`)
  }

  return response.json()
}
