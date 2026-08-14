import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Download, Languages } from "lucide-react"
import type { AppLanguage, LibrarySnapshot, SpokenLanguage } from "../../library/types.js"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { t } from "./uiText"

type Props = { snapshot: LibrarySnapshot }
type Step = "intro" | "setup"

const glassPanel =
  "rounded-[20px] border border-white/20 bg-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/15 backdrop-blur-2xl backdrop-saturate-150"

const primaryButton =
  "h-11 w-full rounded-full border-0 bg-neutral-100 text-base text-neutral-900 hover:bg-white"

export function Welcome({ snapshot }: Props) {
  const [step, setStep] = useState<Step>(snapshot.appLanguage ? "setup" : "intro")
  const [selected, setSelected] = useState<AppLanguage>(snapshot.appLanguage ?? "fa")
  const [spoken, setSpoken] = useState<SpokenLanguage>(snapshot.spokenLanguageDefault)
  const [downloading, setDownloading] = useState(false)
  const [log, setLog] = useState("")
  const nativeGlass = window.doorei.platform === "darwin"

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
        label: modelLabel(model.id, selected)
      })),
    [snapshot.requiredModels, selected]
  )

  return (
    <div
      className="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-16 font-sans"
      dir={selected === "fa" ? "rtl" : "ltr"}
      lang={selected}
    >
      <WelcomeBackdrop nativeGlass={nativeGlass} />
      <div className="relative z-10 w-full">
        {step === "intro" ? (
          <Intro lang={selected} onStart={() => setStep("setup")} />
        ) : (
          <Setup
            lang={selected}
            spoken={spoken}
            models={models}
            log={log}
            downloading={downloading}
            allComplete={allComplete}
            onBack={() => setStep("intro")}
            onAppLanguage={setSelected}
            onSpokenLanguage={setSpoken}
            onDownload={() => {
              setDownloading(true)
              void window.doorei.downloadModels().finally(() => setDownloading(false))
            }}
            onOpen={() => {
              void (async () => {
                await window.doorei.call("setSpokenLanguageDefault", spoken)
                await window.doorei.call("chooseAppLanguage", selected)
              })()
            }}
          />
        )}
      </div>
    </div>
  )
}

function Intro({ lang, onStart }: { lang: AppLanguage; onStart: () => void }) {
  return (
    <div className={cn(glassPanel, "mx-auto w-full max-w-lg px-8 py-10 text-center")}>
      <p className="text-sm font-medium tracking-wide text-white/60">{t(lang, "appName")}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">{t(lang, "welcomeTitle")}</h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/70">
        {t(lang, "welcomeBody")}
      </p>
      <Button size="lg" className={cn(primaryButton, "mt-8")} onClick={onStart}>
        {t(lang, "getStarted")}
      </Button>
    </div>
  )
}

function Setup({
  lang,
  spoken,
  models,
  log,
  downloading,
  allComplete,
  onBack,
  onAppLanguage,
  onSpokenLanguage,
  onDownload,
  onOpen
}: {
  lang: AppLanguage
  spoken: SpokenLanguage
  models: { id: string; complete: boolean; label: string }[]
  log: string
  downloading: boolean
  allComplete: boolean
  onBack: () => void
  onAppLanguage: (language: AppLanguage) => void
  onSpokenLanguage: (language: SpokenLanguage) => void
  onDownload: () => void
  onOpen: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onBack}
        >
          <ArrowLeft className="rtl:rotate-180" />
          {t(lang, "back")}
        </Button>
        <p className="text-sm font-medium text-white/60">{t(lang, "appName")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={cn(glassPanel, "flex flex-col p-6")}>
          <div className="flex items-center gap-2 text-white">
            <Download className="size-4 opacity-70" />
            <h2 className="text-lg font-semibold">{t(lang, "downloadTitle")}</h2>
          </div>
          <p className="mt-1 text-sm text-white/55">{t(lang, "downloadHint")}</p>
          <ul className="mt-5 grid gap-3">
            {models.map((model) => (
              <li
                key={model.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5"
              >
                <span className="truncate text-sm text-white/90">{model.label}</span>
                <Badge
                  variant={model.complete ? "secondary" : "outline"}
                  className={
                    model.complete
                      ? "border-transparent bg-white/15 text-white"
                      : "border-white/20 bg-transparent text-white/55"
                  }
                >
                  {model.complete ? "✓" : "○"}
                </Badge>
              </li>
            ))}
          </ul>
          {log ? (
            <p className="mt-3 truncate text-xs text-white/45">
              {t(lang, "downloadLog")}: {log}
            </p>
          ) : null}
          <div className="mt-auto pt-6">
            <Button
              className="w-full rounded-full border-0 bg-white/90 text-neutral-900 hover:bg-white"
              disabled={downloading || allComplete}
              onClick={onDownload}
            >
              {allComplete
                ? t(lang, "modelsReady")
                : downloading
                  ? t(lang, "downloading")
                  : t(lang, "downloadModels")}
            </Button>
          </div>
        </section>

        <section className={cn(glassPanel, "flex flex-col gap-6 p-6")}>
          <div className="flex items-center gap-2 text-white">
            <Languages className="size-4 opacity-70" />
            <h2 className="text-lg font-semibold">{t(lang, "languageTitle")}</h2>
          </div>

          <LanguagePair
            lang={lang}
            label={t(lang, "appLanguage")}
            hint={t(lang, "appLanguageHint")}
            value={lang}
            onChange={onAppLanguage}
          />
          <LanguagePair
            lang={lang}
            label={t(lang, "courseAsrLanguage")}
            hint={t(lang, "courseAsrLanguageHint")}
            value={spoken}
            onChange={onSpokenLanguage}
          />
        </section>
      </div>

      <Button size="lg" className={primaryButton} disabled={!allComplete} onClick={onOpen}>
        {t(lang, "continue")}
      </Button>
    </div>
  )
}

function LanguagePair({
  lang,
  label,
  hint,
  value,
  onChange
}: {
  lang: AppLanguage
  label: string
  hint: string
  value: AppLanguage | SpokenLanguage
  onChange: (language: AppLanguage) => void
}) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/50">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LanguageChoice
          selected={value === "fa"}
          title={t(lang, "persian")}
          native="فارسی"
          onSelect={() => onChange("fa")}
        />
        <LanguageChoice
          selected={value === "en"}
          title={t(lang, "english")}
          native="English"
          onSelect={() => onChange("en")}
        />
      </div>
    </div>
  )
}

function LanguageChoice({
  selected,
  title,
  native,
  onSelect
}: {
  selected: boolean
  title: string
  native: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-2xl border px-3 py-3 text-start transition",
        selected
          ? "border-white/25 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          : "border-white/10 bg-black/20 text-white/75 hover:bg-white/10"
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-white/45">{native}</span>
    </button>
  )
}

function WelcomeBackdrop({ nativeGlass }: { nativeGlass: boolean }) {
  if (nativeGlass) {
    return <div className="pointer-events-none absolute inset-0 bg-black/20" />
  }

  return (
    <div className="welcome-grain pointer-events-none absolute inset-0">
      <div className="absolute -top-24 start-[-10%] size-[36rem] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-28 end-[-8%] size-[40rem] rounded-full bg-black/70 blur-3xl" />
    </div>
  )
}

function modelLabel(id: string, lang: AppLanguage): string {
  if (id.includes("Shenava")) return t(lang, "modelPersianAsr")
  if (id.includes("parakeet")) return t(lang, "modelEnglishAsr")
  if (id.includes("e5")) return t(lang, "modelEmbedding")
  return id.split("/")[1] ?? id
}
