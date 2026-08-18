import { useEffect, useState } from "react"
import {
  providerByKindFromVault,
  type ProviderFieldKind
} from "../../library/providerConfig.js"
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
import { ProviderFields } from "./ProviderFields"
import { t } from "./uiText"
import { updateStatusLabel } from "./UpdateBanner"
import type { AppUpdateStatus } from "../../main/appUpdate.js"

type Props = {
  snapshot: LibrarySnapshot
  lang: AppLanguage
  open: boolean
  onOpenChange: (open: boolean) => void
}

const tabPanelClass = "min-h-72 overflow-y-auto px-1 py-0.5"

export function SettingsDialog({ snapshot, lang, open, onOpenChange }: Props) {
  const [kind, setKind] = useState<ProviderFieldKind>(snapshot.provider?.kind ?? "none")
  const [byKind, setByKind] = useState(() => providerByKindFromVault(snapshot.providerVault))
  const [improve, setImprove] = useState(snapshot.prompts.improve)
  const [summary, setSummary] = useState(snapshot.prompts.summary)
  const [ask, setAsk] = useState(snapshot.prompts.ask)
  const [version, setVersion] = useState("")
  const [update, setUpdate] = useState<AppUpdateStatus>({ kind: "idle" })
  const languageItems = {
    fa: t(lang, "persian"),
    en: t(lang, "english")
  }

  useEffect(() => {
    if (!open) return
    void window.doorei.appVersion().then(setVersion)
    void window.doorei.updateStatus().then(setUpdate)
    return window.doorei.subscribeUpdate(setUpdate)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t(lang, "settings")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="player" className="min-h-0 min-w-0 flex-1 gap-3 px-5">
          <TabsList className="h-auto min-h-9 w-full shrink-0 flex-wrap bg-white/8">
            <TabsTrigger value="player">{t(lang, "settingsPlayer")}</TabsTrigger>
            <TabsTrigger value="language">{t(lang, "settingsLanguage")}</TabsTrigger>
            <TabsTrigger value="provider">{t(lang, "settingsProvider")}</TabsTrigger>
            <TabsTrigger value="prompts">{t(lang, "settingsPrompts")}</TabsTrigger>
            <TabsTrigger value="app">{t(lang, "settingsApp")}</TabsTrigger>
          </TabsList>
          <TabsContent value="player" className={tabPanelClass}>
            <div className="overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/8">
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
              <Label className="flex items-center justify-between gap-3 px-3 py-2.5 font-normal">
                <span>{t(lang, "speed")}</span>
                <Input
                  id="speed"
                  type="number"
                  step="0.25"
                  min="0.5"
                  max="3"
                  className="h-6 w-14 [appearance:textfield] border-white/10 bg-transparent px-1.5 text-center text-sm tabular-nums dark:bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={snapshot.settings.playbackSpeed}
                  onChange={(event) =>
                    void window.doorei.call("updateSettings", {
                      playbackSpeed: Number(event.target.value)
                    })
                  }
                />
              </Label>
            </div>
          </TabsContent>
          <TabsContent value="language" className={tabPanelClass}>
            <div className="grid gap-4">
              <LanguageField
                id="app-language"
                label={t(lang, "appLanguage")}
                hint={t(lang, "appLanguageHint")}
                value={lang}
                items={languageItems}
                onValueChange={(value) => void window.doorei.call("chooseAppLanguage", value)}
              />
              <LanguageField
                id="spoken-default"
                label={t(lang, "courseAsrLanguage")}
                hint={t(lang, "courseAsrLanguageHint")}
                value={snapshot.spokenLanguageDefault}
                items={languageItems}
                onValueChange={(value) =>
                  void window.doorei.call("setSpokenLanguageDefault", value)
                }
              />
              <LanguageField
                id="output-language"
                label={t(lang, "outputLanguage")}
                value={snapshot.outputLanguage}
                items={languageItems}
                onValueChange={(value) => void window.doorei.call("setOutputLanguage", value)}
              />
            </div>
          </TabsContent>
          <TabsContent value="provider" className={tabPanelClass}>
            <ProviderFields
              lang={lang}
              kind={kind}
              byKind={byKind}
              onKindChange={setKind}
              onFieldsChange={(nextKind, patch) =>
                setByKind((current) => ({
                  ...current,
                  [nextKind]: { ...current[nextKind], ...patch }
                }))
              }
            />
          </TabsContent>
          <TabsContent value="prompts" className={tabPanelClass}>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="improve-prompt">{t(lang, "improvePrompt")}</Label>
                <Textarea
                  id="improve-prompt"
                  className="bg-white/5"
                  value={improve}
                  onChange={(event) => setImprove(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="summary-prompt">{t(lang, "summaryPrompt")}</Label>
                <Textarea
                  id="summary-prompt"
                  className="bg-white/5"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ask-prompt">{t(lang, "askPrompt")}</Label>
                <Textarea
                  id="ask-prompt"
                  className="bg-white/5"
                  value={ask}
                  onChange={(event) => setAsk(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ask-budget">{t(lang, "askContextBudget")}</Label>
                <Input
                  id="ask-budget"
                  type="number"
                  min="1"
                  step="1000"
                  className="bg-white/5"
                  value={snapshot.settings.askContextBudgetTokens}
                  onChange={(event) =>
                    void window.doorei.call("updateSettings", {
                      askContextBudgetTokens: Number(event.target.value)
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="app" className={tabPanelClass}>
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t(lang, "updateHint")}</p>
              <div className="overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/8">
                <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 text-sm">
                  <span>{t(lang, "appVersion")}</span>
                  <span className="tabular-nums text-muted-foreground">{version || "…"}</span>
                </div>
                <div className="px-3 py-2.5 text-sm">{updateStatusLabel(lang, update)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="bg-white/5"
                  disabled={update.kind === "checking" || update.kind === "downloading"}
                  onClick={() => void window.doorei.checkForUpdate()}
                >
                  {t(lang, "updateCheck")}
                </Button>
                {update.kind === "ready" ? (
                  <Button onClick={() => void window.doorei.installUpdate()}>
                    {t(lang, "updateRestart")}
                  </Button>
                ) : null}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="px-5 pt-2 pb-5">
          <Button variant="outline" className="bg-white/5" onClick={() => onOpenChange(false)}>
            {t(lang, "cancel")}
          </Button>
          <Button
            onClick={() => {
              void window.doorei.call("configureProvider", kind, byKind)
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
    <Label className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 font-normal last:border-b-0">
      <span>{label}</span>
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
    </Label>
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
