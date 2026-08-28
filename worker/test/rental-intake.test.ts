import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, test, vi } from 'vitest'

import worker from '../src/index'

async function request(path: string, init?: RequestInit) {
  const context = createExecutionContext()
  const response = await worker.fetch(
    new Request(`https://campusloop.attentionplease.build${path}`, init),
    env,
    context,
  )
  await waitOnExecutionContext(context)
  return response
}

describe('sold-out rental intake API', () => {
  test('rejects new rental intakes before validation or external calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await request('/api/v1/rental-intakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Campus Student',
        email: 'student@example.com',
        agree: true,
        turnstileToken: 'valid-token',
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'sold_out',
        message: 'Campus Loop bedding sets are sold out. New sign-ups and PayPal payments are closed.',
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM rental_intakes').first('count')).toBe(0)
  })

  test('keeps non-POST methods closed', async () => {
    expect((await request('/api/v1/rental-intakes', { method: 'GET' })).status).toBe(405)
  })
})
