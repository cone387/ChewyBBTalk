import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  content: string
  className?: string
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
        <code className={`bg-gray-100 p-3 rounded-lg text-sm overflow-x-auto block my-2 ${className ?? ''}`} {...props}>
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
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
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

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
