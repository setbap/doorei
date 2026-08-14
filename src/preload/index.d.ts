import type { LibrarySnapshot } from "../library/types.js"

declare global {
  interface Window {
    doorei: {
      snapshot: () => Promise<LibrarySnapshot>
      call: (method: string, ...args: unknown[]) => Promise<unknown>
      subscribe: (listener: (snapshot: LibrarySnapshot) => void) => () => void
      mediaUrl: (filePath: string) => Promise<string>
      pickVideos: () => Promise<string[]>
      pickFolderVideos: () => Promise<string[]>
      pickFile: () => Promise<string | null>
      pickDirectory: () => Promise<string | null>
      downloadModels: () => Promise<LibrarySnapshot>
      onDownloadProgress: (
        listener: (progress: {
          modelId: string
          file: string
          received: number
          total: number | null
        }) => void
      ) => () => void
    }
  }
}

export {}
