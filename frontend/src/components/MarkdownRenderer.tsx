import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { Components } from 'react-markdown'
import rehypeSearchHighlight from '../utils/searchHighlight'

interface MarkdownRendererProps {
  content: string
  className?: string
  search?: string
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-gray-900 my-3">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold text-gray-900 my-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-gray-900 my-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-gray-900 my-1">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold text-gray-900 my-1">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-sm font-semibold text-gray-900 my-1">{children}</h6>
  ),
  p: ({ children }) => (
    <p className="text-gray-800 leading-relaxed text-[15px] my-1">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes('language-') || false
    if (isBlock) {
      return (
        <code className={`text-sm ${className ?? ''}`} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm" {...props}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre tabIndex={0} aria-label="代码，可横向滚动" className="my-2 max-w-full overflow-x-auto rounded-lg bg-gray-100 p-3 whitespace-pre [overflow-wrap:normal] [&>code]:block [&>code]:bg-transparent [&>code]:p-0 [&>code]:m-0 [&>code]:text-gray-800">{children}</pre>,
  table: ({ children }) => (
    <div tabIndex={0} role="region" aria-label="表格，可横向滚动" className="my-3 max-w-full overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-300 bg-gray-50 p-2 text-left whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 p-2 whitespace-nowrap">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-gray-300 pl-3 my-2 bg-gray-50 rounded p-2">
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }) => (
    <a
      className="text-blue-600 hover:underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 my-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 my-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-gray-800 text-[15px] my-0.5">{children}</li>
  ),
}

export default function MarkdownRenderer({ content, className, search = '' }: MarkdownRendererProps) {
  return (
    <div className={`min-w-0 max-w-full [overflow-wrap:anywhere] ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, [rehypeSearchHighlight, { search }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
