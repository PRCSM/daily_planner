import type { ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from '@/domain/markdown'
import { cn } from '@/lib/cn'

/**
 * Renders the constrained markdown subset as React nodes. Everything is a text node: model output is
 * untrusted and never touches innerHTML, links, images, or navigation.
 */
function InlineRun({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.t === 'bold' ? <strong key={i} className="font-bold">{n.v}</strong>
        : n.t === 'italic' ? <em key={i}>{n.v}</em>
        : n.t === 'code' ? <code key={i} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em]">{n.v}</code>
        : <span key={i}>{n.v}</span>,
      )}
    </>
  )
}

function BlockView({ b }: { b: Block }): ReactNode {
  switch (b.t) {
    case 'p':
      return <p><InlineRun nodes={b.inline} /></p>
    case 'ul':
      return <ul className="list-disc space-y-1.5 pl-5">{b.items.map((it, i) => <li key={i}><InlineRun nodes={it} /></li>)}</ul>
    case 'ol':
      return <ol className="list-decimal space-y-1.5 pl-5">{b.items.map((it, i) => <li key={i}><InlineRun nodes={it} /></li>)}</ol>
    case 'code':
      return <CodeBlock code={b.v} lang={b.lang} />
  }
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <pre className="overflow-x-auto rounded-[12px] bg-bg p-3.5 font-mono text-[13px] leading-relaxed text-ink" aria-label={lang ? `${lang} code` : 'code'} tabIndex={0}>
      <code>{code}</code>
    </pre>
  )
}

export function Prose({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text)
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {blocks.map((b, i) => <BlockView key={i} b={b} />)}
    </div>
  )
}
