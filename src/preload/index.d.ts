import type { LibrarySnapshot } from "../library/types.js"
import type { AppUpdateStatus } from "../main/appUpdate.js"

declare global {
  interface Window {
    doorei: {
      platform: string
      appVersion: () => Promise<string>
      updateStatus: () => Promise<AppUpdateStatus>
      checkForUpdate: () => Promise<AppUpdateStatus>
      installUpdate: () => Promise<void>
      subscribeUpdate: (listener: (status: AppUpdateStatus) => void) => () => void
      snapshot: () => Promise<LibrarySnapshot>
      call: (method: string, ...args: unknown[]) => Promise<unknown>
      subscribe: (listener: (snapshot: LibrarySnapshot) => void) => () => void
      mediaUrl: (filePath: string) => Promise<string>
      pickVideos: () => Promise<string[]>
      pickFolderVideos: () => Promise<string[]>
      pickFile: () => Promise<string | null>
      pickDirectory: () => Promise<string | null>
      openUrl: (url: string) => Promise<void>
      onShortcut: (
        listener: (
          action:
            | "openSettings"
            | "toggleActionPanel"
            | "toggleLibrary"
            | "toggleToolPane"
            | "toggleNote"
        ) => void
      ) => () => void
      onSelectAll: (listener: () => void) => () => void
    }
  }
}

export {}
