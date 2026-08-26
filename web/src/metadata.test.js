import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

const html = readFileSync('index.html', 'utf8')

describe('social metadata', () => {
  test('publishes absolute Open Graph and Twitter image metadata', () => {
    expect(html).toContain('property="og:image" content="https://campusloop.attentionplease.build/assets/campus-loop-og.jpg"')
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(html).toContain('property="og:image:height" content="630"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('name="twitter:image" content="https://campusloop.attentionplease.build/assets/campus-loop-og.jpg"')
  })
})
