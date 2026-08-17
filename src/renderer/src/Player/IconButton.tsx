import type { ReactNode } from "react"
import { Hint } from "../Hint"

export function IconButton({
  label,
  onClick,
  children,
  pressed,
  expanded
}: {
  label: string
  onClick: () => void
  children: ReactNode
  pressed?: boolean
  expanded?: boolean
}) {
  return (
    <Hint
      label={label}
      render={
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          aria-expanded={expanded}
          className="grid size-8 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white [&_svg]:size-4 [&_svg]:scale-90"
          onClick={onClick}
        />
      }
    >
      {children}
    </Hint>
  )
}
