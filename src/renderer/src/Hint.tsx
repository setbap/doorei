import type { ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function Hint({
  label,
  side = "top",
  render,
  children
}: {
  label: string
  side?: "top" | "bottom"
  render: ReactElement
  children?: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={render}>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
