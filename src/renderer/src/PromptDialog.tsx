import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  open: boolean
  title: string
  description?: string
  label: string
  submitLabel: string
  cancelLabel: string
  defaultValue?: string
  extra?: ReactNode
  onOpenChange: (open: boolean) => void
  onSubmit: (value: string) => void
}

export function PromptDialog({
  open,
  title,
  description,
  label,
  submitLabel,
  cancelLabel,
  defaultValue = "",
  extra,
  onOpenChange,
  onSubmit
}: Props) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    const next = value.trim()
    if (!next) return
    onSubmit(next)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="prompt-field">{label}</Label>
            <Input
              id="prompt-field"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </div>
          {extra}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
