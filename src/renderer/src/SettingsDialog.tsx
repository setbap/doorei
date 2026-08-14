import { useState } from "react"
import type { AppLanguage, LibrarySnapshot, SpokenLanguage } from "../../library/types.js"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { t } from "./uiText"

type Props = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ snapshot, lang, open, onOpenChange }: Props) {
  const [url, setUrl] = useState(snapshot.provider?.url ?? "")
  const [key, setKey] = useState(snapshot.provider?.key ?? "")
  const [improve, setImprove] = useState(snapshot.prompts.improve)
  const [summary, setSummary] = useState(snapshot.prompts.summary)
  const [ask, setAsk] = useState(snapshot.prompts.ask)
  const languageItems = {
    fa: t(lang, "persian"),
    en: t(lang, "english")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(lang, "settings")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="player" className="min-w-0">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="player">{t(lang, "settingsPlayer")}</TabsTrigger>
            <TabsTrigger value="language">{t(lang, "settingsLanguage")}</TabsTrigger>
            <TabsTrigger value="provider">{t(lang, "settingsProvider")}</TabsTrigger>
            <TabsTrigger value="prompts">{t(lang, "settingsPrompts")}</TabsTrigger>
          </TabsList>
          <TabsContent value="player" className="mt-4 grid gap-4">
            <SettingCheck
              checked={snapshot.settings.autoplay}
              label={t(lang, "autoplay")}
              onCheckedChange={(checked) =>
                void window.doorei.call("updateSettings", { autoplay: checked })
              }
            />
            <SettingCheck
              checked={snapshot.settings.confetti}
              label={t(lang, "confetti")}
              onCheckedChange={(checked) =>
                void window.doorei.call("updateSettings", { confetti: checked })
              }
            />
            <SettingCheck
              checked={snapshot.settings.subtitlesVisible}
              label={t(lang, "subtitles")}
              onCheckedChange={(checked) =>
                void window.doorei.call("updateSettings", { subtitlesVisible: checked })
              }
            />
            <SettingCheck
              checked={snapshot.settings.autoMarkWatchedAtEnd}
              label={t(lang, "markWatchedAtEnd")}
              onCheckedChange={(checked) =>
                void window.doorei.call("updateSettings", { autoMarkWatchedAtEnd: checked })
              }
            />
            <div className="grid gap-2">
              <Label htmlFor="speed">{t(lang, "speed")}</Label>
              <Input
                id="speed"
                type="number"
                step="0.25"
                min="0.5"
                max="3"
                value={snapshot.settings.playbackSpeed}
                onChange={(event) =>
                  void window.doorei.call("updateSettings", {
                    playbackSpeed: Number(event.target.value)
                  })
                }
              />
            </div>
          </TabsContent>
          <TabsContent value="language" className="mt-4 grid gap-4">
            <LanguageField
              id="output-language"
              label={t(lang, "outputLanguage")}
              value={snapshot.outputLanguage}
              items={languageItems}
              onValueChange={(value) => void window.doorei.call("setOutputLanguage", value)}
            />
            <LanguageField
              id="spoken-default"
              label={t(lang, "spokenDefault")}
              value={snapshot.spokenLanguageDefault}
              items={languageItems}
              onValueChange={(value) =>
                void window.doorei.call("setSpokenLanguageDefault", value)
              }
            />
          </TabsContent>
          <TabsContent value="provider" className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="settings-url">{t(lang, "providerUrl")}</Label>
              <Input
                id="settings-url"
                placeholder={t(lang, "providerUrl")}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="settings-key">{t(lang, "providerKey")}</Label>
              <Input
                id="settings-key"
                placeholder={t(lang, "providerKey")}
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
          </TabsContent>
          <TabsContent value="prompts" className="mt-4 grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="improve-prompt">{t(lang, "improvePrompt")}</Label>
              <Textarea
                id="improve-prompt"
                value={improve}
                onChange={(event) => setImprove(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="summary-prompt">{t(lang, "summaryPrompt")}</Label>
              <Textarea
                id="summary-prompt"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ask-prompt">{t(lang, "askPrompt")}</Label>
              <Textarea
                id="ask-prompt"
                value={ask}
                onChange={(event) => setAsk(event.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t(lang, "cancel")}
          </Button>
          <Button
            onClick={() => {
              void window.doorei.call(
                "configureProvider",
                url.trim() ? { kind: "openai", url: url.trim(), key: key.trim() } : null
              )
              void window.doorei.call("updatePrompt", "improve", improve)
              void window.doorei.call("updatePrompt", "summary", summary)
              void window.doorei.call("updatePrompt", "ask", ask)
              onOpenChange(false)
            }}
          >
            {t(lang, "save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettingCheck({
  checked,
  label,
  onCheckedChange
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Label className="flex items-center gap-2 font-normal">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      {label}
    </Label>
  )
}

function LanguageField({
  id,
  label,
  value,
  items,
  onValueChange
}: {
  id: string
  label: string
  value: AppLanguage | SpokenLanguage
  items: Record<string, string>
  onValueChange: (value: AppLanguage) => void
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (next === "fa" || next === "en") onValueChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full">
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
