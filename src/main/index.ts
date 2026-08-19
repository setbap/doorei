import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, protocol, shell } from "electron"
import { applyAppIdentity, migrateUnpackagedLibrary } from "./appIdentity.js"
import type { AppUpdateStatus } from "./appUpdate.js"
import { startDevBrowserBridge } from "./devBrowserBridge.js"
import { installAppUpdate } from "./installAppUpdate.js"
import { mediaResponse, toMediaUrl } from "./mediaProtocol.js"
import { startMediaServer } from "./mediaServer.js"
import { installDesktopChrome } from "./installDesktopChrome.js"
import { installShortcuts } from "./installShortcuts.js"
import { resolveModelsRoot } from "./userModelPack.js"
import type { ShortcutId } from "./shortcuts.js"
import { createLibrary, type Library, type LibrarySnapshot } from "../library/index.js"
import { createDiskModelStore } from "../adapters/modelStore.js"
import { createNodeMedia, videoPathsInFolder } from "../adapters/media.js"
import { createSpeechRecognizer } from "../adapters/speech.js"
import { createEmbedder } from "../adapters/embedder.js"
import { createProviderClient } from "../adapters/provider.js"

applyAppIdentity(app)
app.commandLine.appendSwitch("disable-pinch")

protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
])

const __dirname = dirname(fileURLToPath(import.meta.url))
let library: Library
let mainWindow: BrowserWindow | null = null

function bundledModelsRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, "models")
  return join(__dirname, "../../resources/models")
}

function dataPaths() {
  const bundledRoot = bundledModelsRoot()
  return {
    dataDir: join(app.getPath("userData"), "library"),
    modelsRoot: app.isPackaged
      ? resolveModelsRoot({
          bundledRoot,
          userRoot: join(app.getPath("userData"), "models")
        })
      : bundledRoot
  }
}

function appIconPath(): string {
  const file = process.platform === "darwin" ? "mac.png" : "icon.png"
  if (app.isPackaged) return join(process.resourcesPath, file)
  return join(__dirname, `../../build/${file}`)
}

function applyDockIcon(): void {
  if (process.platform !== "darwin") return
  const image = nativeImage.createFromPath(appIconPath())
  if (image.isEmpty()) return
  app.dock?.setIcon(image)
}

function createMainWindow(): void {
  const isMac = process.platform === "darwin"
  nativeTheme.themeSource = "dark"
  applyDockIcon()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Doorei",
    icon: appIconPath(),
    show: false,
    backgroundColor: isMac ? "#00000000" : "#171717",
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
      spellcheck: true,
      autoplayPolicy: "no-user-gesture-required",
      zoomFactor: 1
    }
  })

  installDesktopChrome(mainWindow)
  installShortcuts(mainWindow, (id: ShortcutId) => {
    mainWindow?.webContents.send("shortcut", id)
  })

  mainWindow.on("ready-to-show", () => {
    applyDockIcon()
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

const LIBRARY_METHODS = new Set([
  "chooseAppLanguage",
  "configureProvider",
  "updateSettings",
  "createCourse",
  "updateCourse",
  "renameCourse",
  "deleteCourse",
  "selectCourse",
  "createSession",
  "renameSession",
  "deleteSession",
  "reorderSessions",
  "addVideos",
  "reorderVideos",
  "moveVideo",
  "deleteVideo",
  "relinkVideo",
  "relinkFolder",
  "selectVideo",
  "setPlaybackPosition",
  "setWatched",
  "markEnded",
  "nextVideoId",
  "previousVideoId",
  "selectAdjacent",
  "addNote",
  "editNote",
  "search",
  "ask",
  "createConversation",
  "selectConversation",
  "renameConversation",
  "deleteConversation",
  "setActivity",
  "retryJob",
  "dismissFailedJobs",
  "regenerateCaption",
  "generateSummary",
  "generateMissingSummaries"
])

app.whenReady().then(async () => {
  applyDockIcon()
  migrateUnpackagedLibrary(app)
  const media = await startMediaServer()
  protocol.handle("media", (request) => mediaResponse(request))
  const { dataDir, modelsRoot } = dataPaths()
  library = createLibrary({
    dataDir,
    modelStore: createDiskModelStore(modelsRoot),
    media: createNodeMedia(),
    speechRecognizer: createSpeechRecognizer(modelsRoot),
    embedder: createEmbedder(modelsRoot),
    providerClient: createProviderClient(() => library)
  })
  library.subscribe(() => {
    const snap: LibrarySnapshot = library.snapshot()
    mainWindow?.webContents.send("library:changed", snap)
  })

  async function callLibrary(method: string, args: unknown[]): Promise<unknown> {
    if (!LIBRARY_METHODS.has(method)) {
      throw new Error(`Unknown Library method: ${method}`)
    }
    const target = library[method as keyof Library] as (...params: unknown[]) => unknown
    return await target(...args)
  }

  async function pickVideos(): Promise<string[]> {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Video", extensions: ["mp4", "mkv", "webm", "mov", "m4v", "avi"] }]
    })
    return result.canceled ? [] : result.filePaths
  }

  async function pickFolderVideos(): Promise<string[]> {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] })
    if (result.canceled || !result.filePaths[0]) return []
    return videoPathsInFolder(result.filePaths[0])
  }

  async function pickFile(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Video", extensions: ["mp4", "mkv", "webm", "mov", "m4v", "avi"] }]
    })
    return result.filePaths[0] ?? null
  }

  async function pickDirectory(): Promise<string | null> {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] })
    return result.filePaths[0] ?? null
  }

  async function openUrl(url: string): Promise<void> {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.hostname !== "huggingface.co") {
      throw new Error("Blocked URL")
    }
    await shell.openExternal(parsed.href)
  }

  ipcMain.handle("library:snapshot", () => library.snapshot())
  ipcMain.handle("library:call", (_event, method: string, args: unknown[]) => callLibrary(method, args))
  ipcMain.handle("media:url", (_event, filePath: string) => toMediaUrl(filePath, media.origin))
  ipcMain.handle("dialog:videos", pickVideos)
  ipcMain.handle("dialog:folder", pickFolderVideos)
  ipcMain.handle("dialog:file", pickFile)
  ipcMain.handle("dialog:directory", pickDirectory)
  ipcMain.handle("shell:open-url", (_event, url: string) => openUrl(url))
  const updateListeners = new Set<(status: AppUpdateStatus) => void>()
  const updater = installAppUpdate(app, (status) => {
    mainWindow?.webContents.send("update:changed", status)
    for (const listener of updateListeners) listener(status)
  })
  ipcMain.handle("app:version", () => app.getVersion())
  ipcMain.handle("update:status", () => updater.status())
  ipcMain.handle("update:check", () => updater.check())
  ipcMain.handle("update:install", () => updater.install())

  if (!app.isPackaged) {
    try {
      await startDevBrowserBridge({
        snapshot: () => library.snapshot(),
        subscribeSnapshot: (listener) => library.subscribe(() => listener(library.snapshot())),
        call: callLibrary,
        appVersion: () => app.getVersion(),
        updateStatus: () => updater.status(),
        checkForUpdate: () => updater.check(),
        installUpdate: () => updater.install(),
        subscribeUpdate: (listener) => {
          updateListeners.add(listener)
          return () => {
            updateListeners.delete(listener)
          }
        },
        mediaUrl: (filePath) => toMediaUrl(filePath, media.origin),
        pickVideos,
        pickFolderVideos,
        pickFile,
        pickDirectory,
        openUrl
      })
    } catch (error) {
      console.error("Dev browser bridge failed", error)
    }
  }

  createMainWindow()
  void updater.check()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
