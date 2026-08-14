import { useEffect, useMemo, useState } from "react"
import type { AppLanguage, LibrarySnapshot, ProviderKind } from "../../library/types.js"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
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

type Props = { snapshot: LibrarySnapshot }

const PROVIDER_ITEMS: Record<ProviderKind, string> = {
  openai: "OpenAI-compatible",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor"
}

export function Welcome({ snapshot }: Props) {
  const lang = snapshot.appLanguage ?? "fa"
  const [selected, setSelected] = useState<AppLanguage>(lang)
  const [url, setUrl] = useState(snapshot.provider?.url ?? "")
  const [key, setKey] = useState(snapshot.provider?.key ?? "")
  const [kind, setKind] = useState<ProviderKind>(snapshot.provider?.kind ?? "openai")
  const [downloading, setDownloading] = useState(false)
  const [log, setLog] = useState("")

  useEffect(() => {
    return window.doorei.onDownloadProgress((progress) => {
      setLog(`${progress.modelId} — ${progress.file}`)
    })
  }, [])

  const allComplete = snapshot.requiredModels.every((model) => model.complete)
  const languageItems = {
    fa: t(selected, "persian"),
    en: t(selected, "english")
  }

  const models = useMemo(
    () =>
      snapshot.requiredModels.map((model) => ({
        ...model,
        label: model.id.split("/")[1] ?? model.id
      })),
    [snapshot.requiredModels]
  )

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div>
          <p className="text-sm text-muted-foreground">{t(selected, "appName")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t(selected, "welcomeTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t(selected, "welcomeBody")}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="app-language">{t(selected, "appLanguage")}</Label>
          <Select
            value={selected}
            items={languageItems}
            onValueChange={(value) => {
              if (value !== "fa" && value !== "en") return
              setSelected(value)
              void window.doorei.call("chooseAppLanguage", value)
            }}
          >
            <SelectTrigger id="app-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fa">{languageItems.fa}</SelectItem>
              <SelectItem value="en">{languageItems.en}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t(selected, "requiredModels")}</CardTitle>
            <CardDescription>{t(selected, "gateHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {models.map((model) => (
              <div key={model.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{model.label}</span>
                <Badge variant={model.complete ? "secondary" : "outline"}>
                  {model.complete ? "✓" : "○"}
                </Badge>
              </div>
            ))}
            {log ? (
              <p className="truncate text-xs text-muted-foreground">
                {t(selected, "downloadLog")}: {log}
              </p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={downloading || allComplete}
              onClick={() => {
                setDownloading(true)
                void window.doorei.downloadModels().finally(() => setDownloading(false))
              }}
            >
              {allComplete
                ? t(selected, "modelsReady")
                : downloading
                  ? t(selected, "downloading")
                  : t(selected, "downloadModels")}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t(selected, "providerOptional")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t(selected, "providerKind")}</Label>
              <Select
                value={kind}
                items={PROVIDER_ITEMS}
                onValueChange={(value) => {
                  if (value) setKind(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROVIDER_ITEMS) as ProviderKind[]).map((item) => (
                    <SelectItem key={item} value={item}>
                      {PROVIDER_ITEMS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-url">{t(selected, "providerUrl")}</Label>
              <Input
                id="provider-url"
                placeholder={t(selected, "providerUrl")}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-key">{t(selected, "providerKey")}</Label>
              <Input
                id="provider-key"
                placeholder={t(selected, "providerKey")}
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (!url.trim()) {
                  void window.doorei.call("configureProvider", null)
                  return
                }
                void window.doorei.call("configureProvider", {
                  kind,
                  url: url.trim(),
                  key: key.trim()
                })
              }}
            >
              {t(selected, "save")}
            </Button>
          </CardFooter>
        </Card>

        <Button
          className="w-full"
          size="lg"
          disabled={!allComplete}
          onClick={() => {
            void window.doorei.call("chooseAppLanguage", selected)
          }}
        >
          {t(selected, "continue")}
        </Button>
      </div>
    </div>
  )
}
