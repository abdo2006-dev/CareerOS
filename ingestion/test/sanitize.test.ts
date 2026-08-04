import { describe, expect, it } from 'vitest'
import { sanitizeDescription } from '../src/sanitize.js'

describe('sanitizeDescription', () => {
  it('strips script, style, iframe, and event handlers entirely', () => {
    const result = sanitizeDescription(
      '<p onclick="alert(1)">Hello <script>alert(1)</script>and<style>body{color:red}</style> welcome.</p>' +
        '<iframe src="https://evil.example"></iframe>',
    )
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert(1)')
    expect(result).not.toContain('<style')
    expect(result).not.toContain('color:red')
    expect(result).not.toContain('<iframe')
    expect(result).not.toContain('onclick')
    expect(result).toContain('Hello')
    expect(result).toContain('welcome')
  })

  it('drops a javascript: link but keeps its text', () => {
    const result = sanitizeDescription(
      '<a href="javascript:alert(2)">bad link</a>',
    )
    expect(result).not.toContain('javascript:')
    expect(result).toContain('bad link')
  })

  it('removes img tags (and any tracking pixel with them)', () => {
    const result = sanitizeDescription(
      '<p>Body</p><img src="https://tracker.example/pixel.gif">',
    )
    expect(result).not.toContain('<img')
    expect(result).not.toContain('tracker.example')
  })

  it('never renders raw HTML in the output (plain text only)', () => {
    const result = sanitizeDescription('<p>One</p><p>Two</p>')
    expect(result).not.toMatch(/<[a-z]/i)
  })

  it('preserves paragraph and list-item breaks as newlines', () => {
    const result = sanitizeDescription(
      '<p>First paragraph.</p><ul><li>Item one</li><li>Item two</li></ul>',
    )
    const lines = result.split('\n')
    expect(lines).toContain('First paragraph.')
    expect(lines).toContain('Item one')
    expect(lines).toContain('Item two')
  })

  it('is deterministic for the same input', () => {
    const input = '<p>Same content every time.</p>'
    expect(sanitizeDescription(input)).toBe(sanitizeDescription(input))
  })

  it('decodes double-encoded content (observed from Greenhouse) into real text, not literal tags', () => {
    const doubleEncoded =
      '&lt;p&gt;&lt;strong&gt;About Us:&lt;/strong&gt;&lt;/p&gt;'
    const result = sanitizeDescription(doubleEncoded)
    expect(result).not.toContain('&lt;')
    expect(result).not.toContain('<p>')
    expect(result).toContain('About Us:')
  })

  it('still sanitizes a script tag that only appears after decoding', () => {
    const doubleEncoded =
      '&lt;p&gt;Hi&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
    const result = sanitizeDescription(doubleEncoded)
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert(1)')
    expect(result).toContain('Hi')
  })
})
