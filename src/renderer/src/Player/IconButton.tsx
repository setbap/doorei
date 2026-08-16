import type { ReactNode } from "react"

export function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white [&_svg]:size-4 [&_svg]:scale-90"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
