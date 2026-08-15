import type { AppLanguage } from "../../library/types.js"
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
import { t } from "./uiText"

type Props = {
  lang: AppLanguage
  kind: ProviderFieldKind
  url: string
  keyValue: string
  onKindChange: (kind: ProviderFieldKind) => void
  onUrlChange: (url: string) => void
  onKeyChange: (key: string) => void
}

export function ProviderFields({
  lang,
  kind,
  url,
  keyValue,
  onKindChange,
  onUrlChange,
  onKeyChange
}: Props) {
  const kindItems: Record<ProviderFieldKind, string> = {
    none: t(lang, "providerNone"),
    openai: t(lang, "providerKindOpenAI"),
    codex: t(lang, "providerKindCodex"),
    opencode: t(lang, "providerKindOpenCode"),
    cursor: t(lang, "providerKindCursor")
  }
  const showUrl = kind === "openai"
  const showKey = kind === "openai" || kind === "codex" || kind === "cursor"
  const keyLabel = kind === "cursor" ? t(lang, "providerCursorKey") : t(lang, "providerKey")

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
            placeholder={t(lang, "providerUrl")}
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
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
            value={keyValue}
            onChange={(event) => onKeyChange(event.target.value)}
          />
        </div>
      ) : null}
    </div>
  )
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
