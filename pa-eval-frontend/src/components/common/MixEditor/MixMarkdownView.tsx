import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MixMarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="max-h-[520px] overflow-auto text-sm leading-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 text-lg font-semibold leading-7">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-2 text-base font-semibold leading-6">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="my-1 whitespace-pre-wrap break-words">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="text-muted-foreground my-2 border-l pl-3">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');

            return isBlock ? (
              <code className="block overflow-x-auto bg-muted px-3 py-2 font-mono text-xs leading-5 whitespace-pre">
                {children}
              </code>
            ) : (
              <code className="bg-muted px-1 py-0.5 font-mono text-xs">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-2 py-1 align-top">{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
