import { contextBridge, ipcRenderer } from "electron"
import type { LibrarySnapshot } from "../library/index.js"
import type { AppUpdateStatus } from "../main/appUpdate.js"
import type { ShortcutId } from "../main/shortcuts.js"

const api = {
  platform: process.platform,
  appVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  updateStatus: (): Promise<AppUpdateStatus> => ipcRenderer.invoke("update:status"),
  checkForUpdate: (): Promise<AppUpdateStatus> => ipcRenderer.invoke("update:check"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  subscribeUpdate: (listener: (status: AppUpdateStatus) => void): (() => void) => {
    const handler = (_event: unknown, status: AppUpdateStatus) => listener(status)
    ipcRenderer.on("update:changed", handler)
    return () => ipcRenderer.removeListener("update:changed", handler)
  },
  snapshot: (): Promise<LibrarySnapshot> => ipcRenderer.invoke("library:snapshot"),
  call: (method: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke("library:call", method, args),
  subscribe: (listener: (snapshot: LibrarySnapshot) => void): (() => void) => {
    const handler = (_event: unknown, snapshot: LibrarySnapshot) => listener(snapshot)
    ipcRenderer.on("library:changed", handler)
    return () => ipcRenderer.removeListener("library:changed", handler)
  },
  mediaUrl: (filePath: string): Promise<string> => ipcRenderer.invoke("media:url", filePath),
  pickVideos: (): Promise<string[]> => ipcRenderer.invoke("dialog:videos"),
  pickFolderVideos: (): Promise<string[]> => ipcRenderer.invoke("dialog:folder"),
  pickFile: (): Promise<string | null> => ipcRenderer.invoke("dialog:file"),
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:directory"),
  openUrl: (url: string): Promise<void> => ipcRenderer.invoke("shell:open-url", url),
  onShortcut: (listener: (action: ShortcutId) => void): (() => void) => {
    const handler = (_event: unknown, action: ShortcutId) => listener(action)
    ipcRenderer.on("shortcut", handler)
    return () => ipcRenderer.removeListener("shortcut", handler)
  },
  onSelectAll: (listener: () => void): (() => void) => {
    const handler = () => listener()
    ipcRenderer.on("edit:selectAll", handler)
    return () => ipcRenderer.removeListener("edit:selectAll", handler)
  }
}

contextBridge.exposeInMainWorld("doorei", api)

export type DooreiApi = typeof api
