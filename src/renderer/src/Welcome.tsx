import { useEffect, useMemo, useState } from "react"
import type { AppLanguage, LibrarySnapshot, ProviderKind } from "../../library/types.js"
import { Button } from "./components/ui/button"
import { t } from "./uiText"

type Props = { snapshot: LibrarySnapshot }

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

  const models = useMemo(
    () =>
      snapshot.requiredModels.map((model) => ({
        ...model,
        label: model.id.split("/")[1] ?? model.id
      })),
    [snapshot.requiredModels]
  )

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm text-sky-400">{t(selected, "appName")}</p>
        <h1 className="mt-1 text-3xl font-semibold">{t(selected, "welcomeTitle")}</h1>
        <p className="mt-2 text-zinc-400">{t(selected, "welcomeBody")}</p>
      </div>

      <label className="grid gap-2">
        <span className="text-sm text-zinc-400">{t(selected, "appLanguage")}</span>
        <select
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2"
          value={selected}
          onChange={(event) => {
            const value = event.target.value as AppLanguage
            setSelected(value)
            void window.doorei.call("chooseAppLanguage", value)
          }}
        >
          <option value="fa">{t(selected, "persian")}</option>
          <option value="en">{t(selected, "english")}</option>
        </select>
      </label>

      <section className="glass rounded-2xl border border-white/10 p-4">
        <h2 className="text-sm font-medium">{t(selected, "requiredModels")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {models.map((model) => (
            <li key={model.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-zinc-300">{model.label}</span>
              <span className={model.complete ? "text-emerald-400" : "text-amber-400"}>
                {model.complete ? "✓" : "○"}
              </span>
            </li>
          ))}
        </ul>
        {log ? <p className="mt-2 truncate text-xs text-zinc-500">{log}</p> : null}
        <Button
          className="mt-4 w-full"
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
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">{t(selected, "providerOptional")}</h2>
        <select
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2"
          value={kind}
          onChange={(event) => setKind(event.target.value as ProviderKind)}
        >
          <option value="openai">OpenAI-compatible</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
        </select>
        <input
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2"
          placeholder={t(selected, "providerUrl")}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <input
          className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2"
          placeholder={t(selected, "providerKey")}
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          className="rounded-lg border border-white/10 px-3 py-2 text-sm"
          onClick={() => {
            if (!url.trim()) {
              void window.doorei.call("configureProvider", null)
              return
            }
            void window.doorei.call("configureProvider", { kind, url: url.trim(), key: key.trim() })
          }}
        >
          {t(selected, "save")}
        </button>
      </section>

      <p className="text-xs text-zinc-500">{t(selected, "gateHint")}</p>
      <Button
        className="w-full bg-white hover:bg-zinc-200"
        disabled={!allComplete}
        onClick={() => {
          void window.doorei.call("chooseAppLanguage", selected)
        }}
      >
        {t(selected, "continue")}
      </Button>
    </div>
  )
}
