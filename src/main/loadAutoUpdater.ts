import { createRequire } from "node:module"
import type { AppUpdater } from "electron-updater"

const require = createRequire(import.meta.url)

export function requireElectronUpdater(): { autoUpdater: AppUpdater } {
  return require("electron-updater") as { autoUpdater: AppUpdater }
}

export function loadAutoUpdater(): AppUpdater {
  const mod = requireElectronUpdater()
  if (!("autoUpdater" in mod)) {
    throw new Error("electron-updater CommonJS export is missing autoUpdater")
  }
  return mod.autoUpdater
}
