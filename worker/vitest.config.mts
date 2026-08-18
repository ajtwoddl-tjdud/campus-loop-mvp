import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

process.env.TURNSTILE_SECRET ||= 'test-secret'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TURNSTILE_SECRET: 'test-secret',
          TURNSTILE_HOSTNAMES: 'campusloop.attentionplease.build',
        },
      },
    }),
  ],
  test: {
    include: ['./worker/test/**/*.test.ts'],
    setupFiles: ['./worker/test/setup.ts'],
  },
})
