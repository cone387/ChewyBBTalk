import type { Root, Element, RootContent } from 'hast'

// Quoted phrases remain together; ordinary terms split on commas or whitespace.
export function searchTerms(search: string): string[] {
  return [...new Set((search.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,]+/g) ?? [])
    .map(term => /^(["']).*\1$/s.test(term) ? term.slice(1, -1).replace(/\\([\\"'])/g, '$1') : term)
    .filter(Boolean))].sort((a, b) => b.length - a.length)
}

export default function rehypeSearchHighlight(options: { search: string }) {
  const terms = searchTerms(options.search)
  if (!terms.length) return
  const pattern = new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi')
  return (tree: Root) => {
    const walk = (parent: Root | Element) => {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === 'element') {
          if (!['script', 'style', 'mark'].includes(node.tagName)) walk(node)
          return [node]
        }
        if (node.type !== 'text') return [node]
        const result: RootContent[] = []
        let end = 0
        for (const match of node.value.matchAll(pattern)) {
          const start = match.index!
          if (start > end) result.push({ type: 'text', value: node.value.slice(end, start) })
          result.push({ type: 'element', tagName: 'mark', properties: { className: ['bg-amber-200', 'text-gray-900', 'rounded-sm'] }, children: [{ type: 'text', value: match[0] }] })
          end = start + match[0].length
        }
        if (end < node.value.length) result.push({ type: 'text', value: node.value.slice(end) })
        return result.length ? result : [node]
      }) as typeof parent.children
    }
    walk(tree)
  }
}
