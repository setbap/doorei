import type { AppLanguage, ProviderKind, ProviderKindFields } from "../../library/types.js"
import type { ProviderFieldKind } from "../../library/providerConfig.js"
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
import { t } from "./uiText"

type Props = {
  lang: AppLanguage
  kind: ProviderFieldKind
  byKind: Record<ProviderKind, ProviderKindFields>
  onKindChange: (kind: ProviderFieldKind) => void
  onFieldsChange: (kind: ProviderKind, patch: Partial<ProviderKindFields>) => void
}

export function ProviderFields({ lang, kind, byKind, onKindChange, onFieldsChange }: Props) {
  const kindItems: Record<ProviderFieldKind, string> = {
    none: t(lang, "providerNone"),
    openai: t(lang, "providerKindOpenAI"),
    codex: t(lang, "providerKindCodex"),
    opencode: t(lang, "providerKindOpenCode"),
    cursor: t(lang, "providerKindCursor")
  }
  const fields = kind === "none" ? emptyFields() : byKind[kind]
  const showUrl = kind === "openai"
  const showKey = kind === "openai" || kind === "codex" || kind === "cursor"
  const showModel = kind !== "none"
  const showExtra = kind === "openai" || kind === "cursor"
  const keyLabel = kind === "cursor" ? t(lang, "providerCursorKey") : t(lang, "providerKey")
  const modelHint =
    kind === "cursor"
      ? t(lang, "providerModelHintCursor")
      : kind === "openai"
        ? t(lang, "providerModelHintOpenAI")
        : t(lang, "providerModelHintSdk")
  const extraHint = kind === "cursor" ? t(lang, "providerExtraHintCursor") : t(lang, "providerExtraHintOpenAI")
  const extraPlaceholder =
    kind === "cursor" ? '{"fast":true}' : '{"temperature":0.2,"max_tokens":4096}'

  function patch(next: Partial<ProviderKindFields>) {
    if (kind === "none") return
    onFieldsChange(kind, next)
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <div className="grid gap-0.5">
          <Label htmlFor="provider-kind">{t(lang, "providerKind")}</Label>
          <p className="text-xs text-muted-foreground">{t(lang, "providerKindHint")}</p>
        </div>
        <Select
          value={kind}
          items={kindItems}
          onValueChange={(next) => {
            if (isProviderFieldKind(next)) onKindChange(next)
          }}
        >
          <SelectTrigger id="provider-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{kindItems.none}</SelectItem>
            <SelectItem value="openai">{kindItems.openai}</SelectItem>
            <SelectItem value="codex">{kindItems.codex}</SelectItem>
            <SelectItem value="opencode">{kindItems.opencode}</SelectItem>
            <SelectItem value="cursor">{kindItems.cursor}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showUrl ? (
        <div className="grid gap-2">
          <Label htmlFor="provider-url">{t(lang, "providerUrl")}</Label>
          <Input
            id="provider-url"
            placeholder="http://127.0.0.1:11434/v1"
            dir="ltr"
            value={fields.url ?? ""}
            onChange={(event) => patch({ url: event.target.value })}
          />
        </div>
      ) : null}
      {showKey ? (
        <div className="grid gap-2">
          <Label htmlFor="provider-key">{keyLabel}</Label>
          <Input
            id="provider-key"
            placeholder={keyLabel}
            type="password"
            dir="ltr"
            value={fields.key ?? ""}
            onChange={(event) => patch({ key: event.target.value })}
          />
        </div>
      ) : null}
      {showModel ? (
        <div className="grid gap-2">
          <div className="grid gap-0.5">
            <Label htmlFor="provider-model">{t(lang, "providerModel")}</Label>
            <p className="text-xs text-muted-foreground">{modelHint}</p>
          </div>
          <Input
            id="provider-model"
            placeholder={kind === "cursor" ? "composer-2.5" : kind === "openai" ? "gpt-4o-mini" : t(lang, "providerModel")}
            dir="ltr"
            value={fields.model ?? ""}
            onChange={(event) => patch({ model: event.target.value })}
          />
        </div>
      ) : null}
      {showExtra ? (
        <div className="grid gap-2">
          <div className="grid gap-0.5">
            <Label htmlFor="provider-extra">{t(lang, "providerExtra")}</Label>
            <p className="text-xs text-muted-foreground">{extraHint}</p>
          </div>
          <Textarea
            id="provider-extra"
            className="min-h-20 bg-white/5 font-mono text-xs"
            placeholder={extraPlaceholder}
            dir="ltr"
            value={fields.extra ?? ""}
            onChange={(event) => patch({ extra: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  )
}

function emptyFields(): ProviderKindFields {
  return { url: "", key: "", model: "", extra: "" }
}

function isProviderFieldKind(value: string | null): value is ProviderFieldKind {
  return (
    value === "none" ||
    value === "openai" ||
    value === "codex" ||
    value === "opencode" ||
    value === "cursor"
  )
}
