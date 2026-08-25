import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App.jsx'

const paypalMocks = vi.hoisted(() => ({
  options: null,
  buttonProps: null,
}))

vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children, options }) => {
    paypalMocks.options = options
    return <div data-testid="paypal-provider">{children}</div>
  },
  PayPalButtons: (props) => {
    paypalMocks.buttonProps = props
    return (
      <button
        type="button"
        onClick={async () => {
          const orderID = await props.createOrder()
          await props.onApprove({ orderID })
        }}
      >
        Test PayPal checkout
      </button>
    )
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.turnstile
  delete window.paypal
  paypalMocks.options = null
  paypalMocks.buttonProps = null
})

function installTurnstile() {
  let options
  window.turnstile = {
    render: vi.fn((_container, nextOptions) => {
      options = nextOptions
      return 'campus-loop-widget'
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  return {
    verify(token = 'turnstile-token') {
      act(() => options.callback(token))
    },
    api: window.turnstile,
  }
}

async function completeIntake(user) {
  await user.type(screen.getByLabelText('Full name'), 'Campus Student')
  await user.type(screen.getByLabelText('Email'), 'student@example.com')
  await user.type(screen.getByLabelText('Other contact (optional)'), '@campus.student')
  await user.click(screen.getByRole('checkbox', { name: /I agree to Campus Loop storing/ }))
}

describe('Campus Loop bedding service', () => {
  test('presents the direct service, inventory, price, deposit, and contact channels', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Your dorm bed, ready today.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get your bedding set' })).toHaveAttribute('href', '#checkout')
    expect(screen.getByText('20 sets available · while supplies last')).toBeInTheDocument()
    expect(screen.getAllByText('$49.99 USD').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$15 deposit included').length).toBeGreaterThan(0)
    expect(screen.getByText('Pillow')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Email Campus Loop' })).toHaveAttribute('href', 'mailto:nvpz1598@gmail.com')
    expect(screen.getByRole('link', { name: 'Instagram @campusloop.for.u' })).toHaveAttribute('href', 'https://www.instagram.com/campusloop.for.u')
    expect(screen.queryByText('Save your details before payment.')).not.toBeInTheDocument()
    expect(screen.queryByText('We use your email to match your PayPal payment and send collection, return, and deposit-refund instructions.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Apply for the pilot|Pilot application|₩60,000/i)).not.toBeInTheDocument()
  })

  test('shows fixed reference prices and the actual USD charge in Japanese and Traditional Chinese', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Change language' }))
    expect(screen.getAllByText('約 ¥7,900').length).toBeGreaterThan(0)
    expect(screen.getAllByText('保証金 約 ¥2,400 を含む').length).toBeGreaterThan(0)
    expect(screen.getByText(/参考換算：2026年8月21日/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '言語を変更' }))
    expect(screen.getAllByText('約 NT$1,590').length).toBeGreaterThan(0)
    expect(screen.getAllByText('包含約 NT$480 保證金').length).toBeGreaterThan(0)
    expect(screen.getByText(/參考匯率日期：2026 年 8 月 21 日/)).toBeInTheDocument()
    expect(screen.getByText(/PayPal 確認付款後/)).toBeInTheDocument()
  })

  test('requires only the minimum customer details before submission', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    expect(screen.queryByLabelText(/Arrival date|Planned departure date|Housing/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Discord operations channel/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save details and continue' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name and email')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('stores a rental intake, creates a matched PayPal order, and completes capture', async () => {
    const user = userEvent.setup()
    const turnstile = installTurnstile()
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/v1/rental-intakes') {
        return {
          ok: true,
          json: async () => ({
            id: 'CLR-123456789ABC',
            status: 'received',
            createdAt: '2026-08-25T00:00:00Z',
            checkoutToken: 'checkout-capability-token',
            paypal: { clientId: 'live-client-id', environment: 'production' },
          }),
        }
      }
      if (url === '/api/v1/paypal/orders') {
        return { ok: true, json: async () => ({ orderId: '5O190127TN364715T' }) }
      }
      if (url === '/api/v1/paypal/orders/5O190127TN364715T/capture') {
        return { ok: true, json: async () => ({ orderId: '5O190127TN364715T', status: 'COMPLETED' }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    turnstile.verify()
    await completeIntake(user)

    await user.click(screen.getByRole('button', { name: 'Save details and continue' }))

    expect(await screen.findByRole('heading', { name: 'Details saved. Complete payment.' })).toBeInTheDocument()
    expect(screen.getByText(/verify the completed payment automatically/)).toBeInTheDocument()
    expect(screen.queryByText('Reference ID')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/rental-intakes', expect.objectContaining({ method: 'POST' }))
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request).toEqual({
      name: 'Campus Student',
      email: 'student@example.com',
      secondaryContact: '@campus.student',
      agree: true,
      turnstileToken: 'turnstile-token',
    })
    expect(paypalMocks.options).toMatchObject({ clientId: 'live-client-id', currency: 'USD', intent: 'capture' })

    expect(screen.getByLabelText('Pay for the Campus Loop bedding set')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Test PayPal checkout' }))

    expect(await screen.findByRole('heading', { name: 'Payment completed.' })).toBeInTheDocument()
    expect(screen.getByText('PayPal payment verified automatically')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/paypal/orders', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/paypal/orders/5O190127TN364715T/capture',
      expect.objectContaining({ method: 'POST' }),
    )
    const orderRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(orderRequest).toEqual({
      intakeId: 'CLR-123456789ABC',
      checkoutToken: 'checkout-capability-token',
    })
  })

  test('requires Turnstile and resets it after a failed request', async () => {
    const user = userEvent.setup()
    const turnstile = installTurnstile()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await completeIntake(user)

    await user.click(screen.getByRole('button', { name: 'Save details and continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Complete the security check')
    expect(fetchMock).not.toHaveBeenCalled()

    turnstile.verify()
    await user.click(screen.getByRole('button', { name: 'Save details and continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t save your details')
    expect(turnstile.api.reset).toHaveBeenCalledWith('campus-loop-widget')
  })
})
