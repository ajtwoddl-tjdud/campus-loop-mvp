export async function createRentalIntake(payload) {
  const response = await window.fetch('/api/v1/rental-intakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Rental intake failed with status ${response.status}`)
  }

  return response.json()
}

async function postCheckout(path, intake) {
  const response = await window.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intakeId: intake.id,
      checkoutToken: intake.checkoutToken,
    }),
  })

  if (!response.ok) {
    throw new Error(`PayPal checkout failed with status ${response.status}`)
  }

  return response.json()
}

export function createPayPalOrder(intake) {
  return postCheckout('/api/v1/paypal/orders', intake)
}

export function capturePayPalOrder(intake, orderId) {
  return postCheckout(`/api/v1/paypal/orders/${encodeURIComponent(orderId)}/capture`, intake)
}
