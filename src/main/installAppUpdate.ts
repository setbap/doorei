import { loadAutoUpdater } from "./loadAutoUpdater.js"
import { applyAppUpdateEvent, type AppUpdateEvent, type AppUpdateStatus } from "./appUpdate.js"

export type AppUpdateService = {
  status: () => AppUpdateStatus
  check: () => Promise<AppUpdateStatus>
  install: () => void
}

type UpdateApp = {
  isPackaged: boolean
  getVersion: () => string
}

export function installAppUpdate(app: UpdateApp, send: (status: AppUpdateStatus) => void): AppUpdateService {
  let status: AppUpdateStatus = { kind: "idle" }
  const emit = (event: AppUpdateEvent): void => {
    status = applyAppUpdateEvent(status, event)
    send(status)
  }

  if (!app.isPackaged) {
    emit({ type: "disable" })
    return {
      status: () => status,
      check: async () => status,
      install: () => undefined
    }
  }

  const autoUpdater = loadAutoUpdater()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "setbap",
    repo: "doorei"
  })
  if ("verifyUpdateCodeSignature" in autoUpdater) {
    autoUpdater.verifyUpdateCodeSignature = false
  }

  autoUpdater.on("checking-for-update", () => emit({ type: "check" }))
  autoUpdater.on("update-available", (info) => emit({ type: "available", version: info.version }))
  autoUpdater.on("update-not-available", () => emit({ type: "current" }))
  autoUpdater.on("download-progress", (progress) => {
    const version =
      status.kind === "available" || status.kind === "downloading" || status.kind === "ready"
        ? status.version
        : app.getVersion()
    emit({ type: "progress", version, percent: Math.round(progress.percent) })
  })
  autoUpdater.on("update-downloaded", (info) => emit({ type: "ready", version: info.version }))
  autoUpdater.on("error", (error) => emit({ type: "error", message: error.message }))

  return {
    status: () => status,
    check: async () => {
      try {
        await autoUpdater.checkForUpdates()
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : String(error) })
      }
      return status
    },
    install: () => {
      if (status.kind === "ready") autoUpdater.quitAndInstall()
    }
  }
}
