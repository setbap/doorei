import MarkdownImpl from "react-markdown"
import { textDirection } from "../../library/textDirection.js"

export function Markdown({ text }: { text: string }) {
  return (
    <div className="summary-markdown text-sm leading-6" dir={textDirection(text)}>
      <MarkdownImpl
        components={{
          a({ href, children }) {
            return (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  if (href) void window.doorei.openUrl(href)
                }}
              >
                {children}
              </a>
            )
          }
        }}
      >
        {text}
      </MarkdownImpl>
    </div>
  )
}
