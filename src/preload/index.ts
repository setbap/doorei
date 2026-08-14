import { contextBridge, ipcRenderer } from "electron"
import type { LibrarySnapshot } from "../library/index.js"
import type { DownloadProgress } from "../adapters/downloadModels.js"

const api = {
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
  downloadModels: (): Promise<LibrarySnapshot> => ipcRenderer.invoke("models:download"),
  onDownloadProgress: (listener: (progress: DownloadProgress) => void): (() => void) => {
    const handler = (_event: unknown, progress: DownloadProgress) => listener(progress)
    ipcRenderer.on("models:progress", handler)
    return () => ipcRenderer.removeListener("models:progress", handler)
  }
}

contextBridge.exposeInMainWorld("doorei", api)

export type DooreiApi = typeof api
