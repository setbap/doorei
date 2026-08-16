import MarkdownImpl from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ReactNode } from "react"
import type { Hit } from "../../library/types.js"
import { textDirection } from "../../library/textDirection.js"
import { linkHitCitations, resolveHit } from "../../library/hitLinks.js"
import { repairMarkdownTables } from "../../library/markdownTables.js"

export function Markdown({
  text,
  hits,
  onHit
}: {
  text: string
  hits?: Hit[]
  onHit?: (videoId: string, seconds: number) => void
}) {
  return (
    <div className="summary-markdown text-sm leading-6" data-selectable dir={textDirection(text)}>
      <MarkdownImpl
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table>{children}</table>
              </div>
            )
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  const target = resolveHit(href, childrenToText(children), hits)
                  if (target && onHit) {
                    onHit(target.videoId, target.seconds)
                    return
                  }
                  if (href && !href.startsWith("#")) void window.doorei.openUrl(href)
                }}
              >
                {children}
              </a>
            )
          }
        }}
      >
        {linkHitCitations(repairMarkdownTables(text), hits)}
      </MarkdownImpl>
    </div>
  )
}

function childrenToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(childrenToText).join("")
  if (typeof node === "object" && "props" in node) {
    return childrenToText((node.props as { children?: ReactNode }).children)
  }
  return ""
}
