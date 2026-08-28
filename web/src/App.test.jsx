import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import App from './App.jsx'

describe('Campus Loop sold-out state', () => {
  test('shows sold out prominently and removes every purchase entry point', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Your dorm bed, ready today.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sold out' })).toHaveAttribute('href', '#sold-out')
    expect(screen.getByText('Sold out · PayPal checkout is closed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This season is sold out.' })).toBeInTheDocument()
    expect(screen.getByText(/closed new sign-ups and PayPal payments/)).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Pay for the Campus Loop bedding set')).not.toBeInTheDocument()
    expect(screen.queryByText('Save details and continue')).not.toBeInTheDocument()
  })

  test('keeps the sold-out state in Japanese and Traditional Chinese', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Change language' }))
    expect(screen.getByRole('link', { name: '完売しました' })).toHaveAttribute('href', '#sold-out')
    expect(screen.getByRole('heading', { name: '今シーズン分は完売しました。' })).toBeInTheDocument()
    expect(screen.getByText('完売 · PayPal決済は終了しました')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '言語を変更' }))
    expect(screen.getByRole('link', { name: '已售完' })).toHaveAttribute('href', '#sold-out')
    expect(screen.getByRole('heading', { name: '本季寢具組已售完。' })).toBeInTheDocument()
    expect(screen.getByText('已售完 · PayPal 結帳已關閉')).toBeInTheDocument()
  })

  test('retains product and support information for sold-out visitors', () => {
    render(<App />)

    expect(screen.getByText('Pillow')).toBeInTheDocument()
    expect(screen.getAllByText('$49.99 USD').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Contact Campus Loop' })).toHaveAttribute('href', 'mailto:nvpz1598@gmail.com')
    expect(screen.getByRole('link', { name: 'Instagram @campusloop.for.u' })).toHaveAttribute('href', 'https://www.instagram.com/campusloop.for.u')
  })
})
