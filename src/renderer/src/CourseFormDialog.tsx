import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import {
  COURSE_NAME_MAX,
  COURSE_NAME_MIN,
  COURSE_PROMPT_MAX,
  COURSE_PROMPT_MIN
} from "../../library/defaults.js"
import type { AppLanguage, CoursePrompts, SpokenLanguage } from "../../library/types.js"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { textDirection } from "../../library/textDirection.js"
import { t } from "./uiText"

export type CourseFormValues = {
  name: string
  spokenLanguageDefault: SpokenLanguage
  outputLanguage: AppLanguage
  prompts: CoursePrompts
}

type Props = {
  open: boolean
  lang: AppLanguage
  title: string
  submitLabel: string
  values: CourseFormValues
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CourseFormValues) => void
}

export function CourseFormDialog({
  open,
  lang,
  title,
  submitLabel,
  values,
  onOpenChange,
  onSubmit
}: Props) {
  const [name, setName] = useState(values.name)
  const [spoken, setSpoken] = useState<SpokenLanguage>(values.spokenLanguageDefault)
  const [output, setOutput] = useState<AppLanguage>(values.outputLanguage)
  const [improve, setImprove] = useState(values.prompts.improve)
  const [summary, setSummary] = useState(values.prompts.summary)
  const [ask, setAsk] = useState(values.prompts.ask)
  const languageItems = {
    fa: t(lang, "persian"),
    en: t(lang, "english")
  }

  useEffect(() => {
    if (!open) return
    setName(values.name)
    setSpoken(values.spokenLanguageDefault)
    setOutput(values.outputLanguage)
    setImprove(values.prompts.improve)
    setSummary(values.prompts.summary)
    setAsk(values.prompts.ask)
  }, [open])

  const nameError = nameErrorFor(name.trim())
  const improveError = promptErrorFor(improve)
  const summaryError = promptErrorFor(summary)
  const askError = promptErrorFor(ask)
  const valid = !nameError && !improveError && !summaryError && !askError

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()
    if (!valid) return
    onSubmit({
      name: name.trim(),
      spokenLanguageDefault: spoken,
      outputLanguage: output,
      prompts: {
        improve: improve.trim(),
        summary: summary.trim(),
        ask: ask.trim()
      }
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-1">
            <Field
              id="course-name"
              label={t(lang, "courseName")}
              error={name.trim() && nameError ? t(lang, nameError) : undefined}
            >
              <Input
                id="course-name"
                value={name}
                dir={name.trim() ? textDirection(name) : "auto"}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </Field>
            <LanguageField
              id="course-spoken"
              label={t(lang, "courseAsrLanguage")}
              hint={t(lang, "courseAsrLanguageHint")}
              value={spoken}
              items={languageItems}
              onValueChange={setSpoken}
            />
            <LanguageField
              id="course-output"
              label={t(lang, "outputLanguage")}
              hint={t(lang, "outputLanguageHint")}
              value={output}
              items={languageItems}
              onValueChange={setOutput}
            />
            <PromptField
              id="course-improve"
              lang={lang}
              label={t(lang, "improvePrompt")}
              value={improve}
              error={improveError}
              onChange={setImprove}
            />
            <PromptField
              id="course-summary"
              lang={lang}
              label={t(lang, "summaryPrompt")}
              value={summary}
              error={summaryError}
              onChange={setSummary}
            />
            <PromptField
              id="course-ask"
              lang={lang}
              label={t(lang, "askPrompt")}
              value={ask}
              error={askError}
              onChange={setAsk}
            />
          </div>
          <DialogFooter className="px-5 pt-2 pb-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t(lang, "cancel")}
            </Button>
            <Button type="submit" disabled={!valid}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function nameErrorFor(name: string): "courseNameTooShort" | "courseNameTooLong" | null {
  if (name.length < COURSE_NAME_MIN) return "courseNameTooShort"
  if (name.length > COURSE_NAME_MAX) return "courseNameTooLong"
  return null
}

function promptErrorFor(value: string): "promptTooShort" | "promptTooLong" | null {
  const length = value.trim().length
  if (length < COURSE_PROMPT_MIN) return "promptTooShort"
  if (length > COURSE_PROMPT_MAX) return "promptTooLong"
  return null
}

function Field({
  id,
  label,
  error,
  children
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function PromptField({
  id,
  lang,
  label,
  value,
  error,
  onChange
}: {
  id: string
  lang: AppLanguage
  label: string
  value: string
  error: "promptTooShort" | "promptTooLong" | null
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        className="min-h-24 bg-white/5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="text-xs text-destructive">{t(lang, error)}</p> : null}
    </div>
  )
}

function LanguageField({
  id,
  label,
  hint,
  value,
  items,
  onValueChange
}: {
  id: string
  label: string
  hint?: string
  value: AppLanguage | SpokenLanguage
  items: Record<string, string>
  onValueChange: (value: AppLanguage) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (next === "fa" || next === "en") onValueChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full bg-white/5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fa">{items.fa}</SelectItem>
          <SelectItem value="en">{items.en}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
