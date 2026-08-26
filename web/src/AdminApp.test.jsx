import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import AdminApp from './AdminApp.jsx'

vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children, options }) => <div data-testid="paypal-provider" data-disable-funding={options.disableFunding} data-csp-nonce={options.dataCspNonce}>{children}</div>,
  PayPalButtons: ({ createOrder, onApprove, disabled, fundingSource }) => <button data-funding-source={fundingSource} disabled={disabled} onClick={async () => {
    const orderID = await createOrder()
    await onApprove({ orderID })
  }}>PayPal $1 테스트 결제</button>,
}))

const ITEM = {
  id: 'CLR-123456789ABC',
  customerName: 'Campus Student',
  customerEmail: 'student@example.com',
  secondaryContact: '@student',
  paypalOrderId: '5O190127TN364715T',
  paypalCaptureId: null,
  paymentStatus: 'created',
  paidAt: null,
  fulfillmentStatus: 'pending',
  refundStatus: 'not_due',
  adminNotes: '',
  consentAt: '2026-08-26T00:00:00.000Z',
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: null,
}

function json(data, status = 200, headers = {}) {
  return new window.Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.className = ''
  document.querySelector('meta[name="csp-nonce"]')?.remove()
})

describe('Admin backoffice', () => {
  test('shows a login gate when there is no server session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { message: 'login required' } }, 401)))
    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '운영 백오피스' })).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'password')
    expect(screen.queryByText('렌탈 운영 대시보드')).not.toBeInTheDocument()
  })

  test('loads operations data and saves an audited status edit with CSRF', async () => {
    const cspMeta = document.createElement('meta')
    cspMeta.name = 'csp-nonce'
    cspMeta.content = 'test-csp-nonce'
    document.head.append(cspMeta)
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/v1/admin/session') return json({ authenticated: true, username: 'admin', csrfToken: 'csrf-token', expiresAt: 9999999999 })
      if (url === '/api/v1/admin/overview') return json({ total: 1, paid: 0, ready: 0, collected: 0, returned: 0, refundsPending: 0, refundsCompleted: 0 })
      if (String(url).startsWith('/api/v1/admin/intakes?')) return json({ items: [ITEM], total: 1, limit: 50, offset: 0 })
      if (url === '/api/v1/admin/audit?limit=50') return json({ items: [] })
      if (url === '/api/v1/admin/paypal/config') return json({ clientId: 'live-client-id', environment: 'production' })
      if (url === '/api/v1/admin/paypal/test-orders' && (!options.method || options.method === 'GET')) return json({ items: [] })
      if (url === '/api/v1/admin/paypal/test-orders' && options.method === 'POST') return json({ orderId: '9AB12345CD678901E', testId: 'CLT-123456789ABC' }, 201)
      if (url === '/api/v1/admin/paypal/test-orders/9AB12345CD678901E/capture' && options.method === 'POST') return json({ orderId: '9AB12345CD678901E', testId: 'CLT-123456789ABC', status: 'COMPLETED' })
      if (url === `/api/v1/admin/intakes/${ITEM.id}` && options.method === 'PATCH') {
        return json({ item: { ...ITEM, fulfillmentStatus: 'ready', adminNotes: '308관 전달 예정' } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '렌탈 운영 대시보드' })).toBeInTheDocument()
    expect(await screen.findByText('Campus Student')).toBeInTheDocument()
    expect(screen.getByText('student@example.com')).toBeInTheDocument()
    expect(await screen.findByText('LIVE 결제입니다.')).toBeInTheDocument()
    expect(screen.getByTestId('paypal-provider')).toHaveAttribute('data-disable-funding', 'venmo')
    expect(screen.getByTestId('paypal-provider')).toHaveAttribute('data-csp-nonce', 'test-csp-nonce')
    expect(screen.getByRole('button', { name: 'PayPal $1 테스트 결제' })).not.toHaveAttribute('data-funding-source')
    await user.click(screen.getByRole('button', { name: 'PayPal $1 테스트 결제' }))
    expect(await screen.findByText('결제 완료 · 9AB12345CD678901E')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/paypal/test-orders', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
    }))
    await user.click(screen.getByRole('button', { name: '상세 / 편집' }))
    const editor = screen.getByRole('complementary', { name: '신청 상세 편집' })
    await user.selectOptions(within(editor).getByLabelText('운영 상태'), 'ready')
    await user.type(within(editor).getByPlaceholderText('수령 위치, 특이사항, 환급 확인 등'), '308관 전달 예정')
    await user.click(within(editor).getByRole('button', { name: '변경사항 저장' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/intakes/${ITEM.id}`,
      expect.objectContaining({ method: 'PATCH', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }) }),
    ))
    const updateCall = fetchMock.mock.calls.find(([url]) => url === `/api/v1/admin/intakes/${ITEM.id}`)
    expect(JSON.parse(updateCall[1].body)).toMatchObject({ fulfillmentStatus: 'ready', adminNotes: '308관 전달 예정' })
  })
})
