import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App.jsx'


afterEach(() => {
  vi.unstubAllGlobals()
  delete window.turnstile
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
    expire() {
      act(() => options['expired-callback']())
    },
    api: window.turnstile,
  }
}


describe('Chung-Ang bedding pilot landing page', () => {
  test('leads with the pilot promise and transparent KRW pricing', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Land in Seoul with your bed ready.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Apply for the pilot' })).toHaveAttribute('href', '#apply')
    expect(screen.getByRole('img', { name: 'A made bed in a compact Seoul student dorm room' })).toHaveAttribute('src', '/assets/campus-loop-hero-cau.png')
    expect(screen.getByRole('img', { name: 'The complete Campus Loop bedding set' })).toHaveAttribute('src', '/assets/campus-loop-kit-flatlay.png')
    expect(screen.getByRole('img', { name: 'An exchange student arriving to a prepared dorm bed' })).toHaveAttribute('src', '/assets/campus-loop-arrival-scene.png')
    expect(screen.getByRole('img', { name: 'The complete bedding set being returned' })).toHaveAttribute('src', '/assets/campus-loop-return-scene.png')
    expect(screen.getAllByText('₩60,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('₩20,000 back after return').length).toBeGreaterThan(0)
    expect(screen.getByText('Pillow')).toBeInTheDocument()
    expect(screen.getByText('Pillow cover')).toBeInTheDocument()
    expect(screen.queryByText('Pillow insert is not included.')).not.toBeInTheDocument()
    expect(screen.queryByText(/NTU|NTNU|NTD|Taipei/i)).not.toBeInTheDocument()
  })

  test('offers the price and non-confirmation message in all three languages', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('This application is not a confirmed reservation or payment.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change language' }))
    expect(screen.getByText('この申請は予約確定や支払いではありません。')).toBeInTheDocument()
    expect(screen.getAllByText('返却後 ₩20,000 キャッシュバック').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '言語を変更' }))
    expect(screen.getByText('此申請並非已確認的預約或付款。')).toBeInTheDocument()
    expect(screen.getAllByText('歸還後退還 ₩20,000').length).toBeGreaterThan(0)
  })

  test('shows actionable errors instead of submitting an incomplete application', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Complete every required field before applying.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('submits a valid application and shows a non-confirmation success state', async () => {
    const user = userEvent.setup()
    const turnstile = installTurnstile()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'CLP-123456789ABC', status: 'received', createdAt: '2026-08-18T00:00:00Z' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    turnstile.verify()

    await user.click(screen.getByRole('checkbox', { name: 'I am a Chung-Ang University exchange student.' }))
    await user.click(screen.getByRole('radio', { name: 'On-campus dormitory' }))
    await user.type(screen.getByLabelText('Arrival date'), '2026-08-28')
    await user.type(screen.getByLabelText('Planned departure date'), '2026-12-20')
    await user.type(screen.getByLabelText('Full name'), 'Campus Student')
    await user.type(screen.getByLabelText('Email'), 'student@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I agree to Campus Loop storing/ }))
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByRole('heading', { name: 'Application received.' })).toBeInTheDocument()
    expect(screen.getByText(/does not confirm your place/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/pilot-applications',
      expect.objectContaining({ method: 'POST' }),
    )
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.turnstileToken).toBe('turnstile-token')
  })

  test('requires Turnstile verification and resets it after a failed request', async () => {
    const user = userEvent.setup()
    const turnstile = installTurnstile()
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    await user.click(screen.getByRole('checkbox', { name: 'I am a Chung-Ang University exchange student.' }))
    await user.click(screen.getByRole('radio', { name: 'On-campus dormitory' }))
    await user.type(screen.getByLabelText('Arrival date'), '2026-08-28')
    await user.type(screen.getByLabelText('Planned departure date'), '2026-12-20')
    await user.type(screen.getByLabelText('Full name'), 'Campus Student')
    await user.type(screen.getByLabelText('Email'), 'student@example.com')
    await user.click(screen.getByRole('checkbox', { name: /I agree to Campus Loop storing/ }))
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Complete the security check before applying.')
    expect(fetchMock).not.toHaveBeenCalled()

    turnstile.verify()
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t submit your application.')
    expect(turnstile.api.reset).toHaveBeenCalledWith('campus-loop-widget')
  })
})
