import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MarkdownRenderer from '../src/components/MarkdownRenderer'
import { searchTerms } from '../src/utils/searchHighlight'

afterEach(cleanup)

describe('search highlighting', () => {
  it('matches literal Chinese, case-insensitive words and regex characters', () => {
    const { container } = render(<MarkdownRenderer content={'中文 Alpha a+b [test]'} search={'中文 alpha a+b [test]'} />)
    expect([...container.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['中文', 'Alpha', 'a+b', '[test]'])
    expect(container.textContent).toBe('中文 Alpha a+b [test]')
  })

  it('preserves links and code, and removes highlights when search clears', () => {
    const content = '[Alpha](https://example.com/alpha) `alpha`\n\n```js\nalpha()\n```'
    const { container, rerender } = render(<MarkdownRenderer content={content} search="alpha" />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/alpha')
    expect(container.querySelectorAll('mark')).toHaveLength(3)
    expect(container.querySelector('pre code')?.textContent).toBe('alpha()\n')
    rerender(<MarkdownRenderer content={content} />)
    expect(container.querySelectorAll('mark')).toHaveLength(0)
    expect(container.querySelector('pre code')?.textContent).toBe('alpha()\n')
  })

  it('retains sanitization and never interprets a search term as HTML', () => {
    const { container } = render(<MarkdownRenderer content={'[click](javascript:alert(1))\n\n<script>alert(1)</script>\n\nplain'} search={'<img onerror=alert(1)> plain'} />)
    expect(container.querySelector('script, img')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:')
    expect(container.querySelector('mark')?.textContent).toBe('plain')
  })

  it('keeps quoted phrases together and handles whitespace-only input', () => {
    expect(searchTerms('"hello world",中文 alpha')).toEqual(['hello world', 'alpha', '中文'])
    expect(searchTerms('   , ')).toEqual([])
  })
})
