import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { Hint } from "../Hint"

export function Swatches({
  values,
  selected,
  onSelect,
  name,
  transparentLabel
}: {
  values: string[]
  selected: string
  onSelect: (value: string) => void
  name: string
  transparentLabel: string
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={name}>
      {values.map((value) => {
        const label = `${name}: ${value === "transparent" ? transparentLabel : value}`
        const pressed = selected.toLowerCase() === value.toLowerCase()
        return (
          <Hint
            key={value}
            label={label}
            render={
              <button
                type="button"
                aria-label={label}
                aria-pressed={pressed}
                className={cn(
                  "size-6 rounded-full ring-1 ring-white/25",
                  pressed && "ring-2 ring-white"
                )}
                style={swatchStyle(value)}
                onClick={() => onSelect(value)}
              />
            }
          />
        )
      })}
    </div>
  )
}

function swatchStyle(value: string): CSSProperties {
  if (value === "transparent") {
    return {
      backgroundImage:
        "linear-gradient(45deg, #555 25%, transparent 25%), linear-gradient(-45deg, #555 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #555 75%), linear-gradient(-45deg, transparent 75%, #555 75%)",
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0"
    }
  }
  return { backgroundColor: value }
}
