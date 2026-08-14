import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-sky-500 text-zinc-950 hover:bg-sky-400",
        outline: "border border-white/10 hover:bg-white/5",
        ghost: "hover:bg-white/5"
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 px-2 text-xs"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}
