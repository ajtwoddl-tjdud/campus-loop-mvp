import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { pbkdf2Sync } from 'node:crypto'
import { defineConfig } from 'vitest/config'

const testAdminSalt = Buffer.from('campus-loop-test-salt').toString('base64url')
const testAdminHash = pbkdf2Sync('test-admin-password', 'campus-loop-test-salt', 100_000, 32, 'sha256').toString('base64url')
const testAdminPasswordHash = `pbkdf2-sha256$100000$${testAdminSalt}$${testAdminHash}`

process.env.TURNSTILE_SECRET ||= 'test-secret'
process.env.DISCORD_WEBHOOK_URL ||= 'https://discord.com/api/webhooks/test-id/test-token'
process.env.PAYPAL_CLIENT_ID ||= 'test-paypal-client-id'
process.env.PAYPAL_CLIENT_SECRET ||= 'test-paypal-client-secret'
process.env.PAYPAL_WEBHOOK_ID ||= 'test-paypal-webhook-id'
process.env.ADMIN_USERNAME ||= 'admin'
process.env.ADMIN_PASSWORD_HASH ||= testAdminPasswordHash
process.env.ADMIN_SESSION_SECRET ||= 'test-admin-session-secret-with-32-bytes'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TURNSTILE_SECRET: 'test-secret',
          TURNSTILE_HOSTNAMES: 'campusloop.attentionplease.build',
          DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test-id/test-token',
          PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
          PAYPAL_ENVIRONMENT: 'sandbox',
          PAYPAL_CLIENT_ID: 'test-paypal-client-id',
          PAYPAL_CLIENT_SECRET: 'test-paypal-client-secret',
          PAYPAL_WEBHOOK_ID: 'test-paypal-webhook-id',
          ADMIN_USERNAME: 'admin',
          ADMIN_PASSWORD_HASH: testAdminPasswordHash,
          ADMIN_SESSION_SECRET: 'test-admin-session-secret-with-32-bytes',
        },
      },
    }),
  ],
  test: {
    include: ['./worker/test/**/*.test.ts'],
    setupFiles: ['./worker/test/setup.ts'],
  },
})
