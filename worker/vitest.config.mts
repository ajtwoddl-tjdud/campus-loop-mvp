import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

process.env.TURNSTILE_SECRET ||= 'test-secret'
process.env.DISCORD_WEBHOOK_URL ||= 'https://discord.com/api/webhooks/test-id/test-token'
process.env.PAYPAL_CLIENT_ID ||= 'test-paypal-client-id'
process.env.PAYPAL_CLIENT_SECRET ||= 'test-paypal-client-secret'
process.env.PAYPAL_WEBHOOK_ID ||= 'test-paypal-webhook-id'

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
        },
      },
    }),
  ],
  test: {
    include: ['./worker/test/**/*.test.ts'],
    setupFiles: ['./worker/test/setup.ts'],
  },
})
