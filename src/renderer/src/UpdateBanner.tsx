import { useEffect, useState } from "react"
import type { AppLanguage } from "../../library/types.js"
import type { AppUpdateStatus } from "../../main/appUpdate.js"
import { Button } from "@/components/ui/button"
import { t } from "./uiText"

export function UpdateBanner({ lang }: { lang: AppLanguage | null }) {
  const [status, setStatus] = useState<AppUpdateStatus>({ kind: "idle" })

  useEffect(() => {
    void window.doorei.updateStatus().then(setStatus)
    return window.doorei.subscribeUpdate(setStatus)
  }, [])

  if (status.kind === "downloading") {
    return (
      <div className="flex items-center justify-center gap-3 border-b border-white/10 bg-sky-500/15 px-3 py-1.5 text-sm">
        {t(lang, "updateDownloading").replace("{percent}", String(status.percent))}
      </div>
    )
  }
  if (status.kind !== "ready") return null
  return (
    <div className="flex items-center justify-center gap-3 border-b border-white/10 bg-emerald-500/15 px-3 py-1.5 text-sm">
      <span>{t(lang, "updateReady").replace("{version}", status.version)}</span>
      <Button size="xs" onClick={() => void window.doorei.installUpdate()}>
        {t(lang, "updateRestart")}
      </Button>
    </div>
  )
}

export function updateStatusLabel(lang: AppLanguage | null, status: AppUpdateStatus): string {
  switch (status.kind) {
    case "disabled":
      return t(lang, "updateDisabled")
    case "checking":
      return t(lang, "updateChecking")
    case "current":
      return t(lang, "updateCurrent")
    case "available":
      return t(lang, "updateAvailable").replace("{version}", status.version)
    case "downloading":
      return t(lang, "updateDownloading").replace("{percent}", String(status.percent))
    case "ready":
      return t(lang, "updateReady").replace("{version}", status.version)
    case "error":
      return `${t(lang, "updateError")}: ${status.message}`
    case "idle":
      return t(lang, "updateIdle")
  }
}
