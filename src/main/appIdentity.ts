import { cpSync, existsSync } from "node:fs"
import { join } from "node:path"

export const APP_NAME = "Doorei"
export const APP_ID = "dev.doorei.app"

type IdentityApp = {
  setName(name: string): void
  setAppUserModelId(id: string): void
  setAboutPanelOptions(options: { applicationName: string }): void
}

type UserDataApp = {
  isPackaged: boolean
  getPath(name: "userData" | "appData"): string
}

export function applyAppIdentity(app: IdentityApp): void {
  app.setName(APP_NAME)
  app.setAppUserModelId(APP_ID)
  app.setAboutPanelOptions({ applicationName: APP_NAME })
  process.title = APP_NAME
}

export function migrateUnpackagedLibrary(app: UserDataApp): void {
  if (app.isPackaged) return
  const dest = join(app.getPath("userData"), "library")
  if (existsSync(dest)) return
  const src = join(app.getPath("appData"), "Electron", "library")
  if (!existsSync(src)) return
  cpSync(src, dest, { recursive: true })
}
