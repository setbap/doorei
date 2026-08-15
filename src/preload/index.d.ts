import type { LibrarySnapshot } from "../library/types.js"

declare global {
  interface Window {
    doorei: {
      platform: string
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
    }
  }
}

export {}
