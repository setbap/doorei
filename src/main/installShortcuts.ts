import { Menu, app, type BrowserWindow, type MenuItemConstructorOptions } from "electron"
import { chromeKeyAction, shouldBlockChromeKey } from "./chromeKeys.js"
import { editMenuTemplate } from "./installDesktopChrome.js"
import { shortcutFromInput, type ShortcutId } from "./shortcuts.js"

export function installShortcuts(
  window: BrowserWindow,
  send: (id: ShortcutId) => void
): void {
  window.webContents.on("before-input-event", (event, input) => {
    const action = shortcutFromInput(input)
    if (action) {
      event.preventDefault()
      send(action)
      return
    }
    const chrome = chromeKeyAction(input)
    if (chrome && shouldBlockChromeKey(chrome, app.isPackaged)) {
      event.preventDefault()
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(window, send)))
}

function appMenuTemplate(
  window: BrowserWindow,
  send: (id: ShortcutId) => void
): MenuItemConstructorOptions[] {
  const settingsItem: MenuItemConstructorOptions = {
    label: "Settings",
    accelerator: "CommandOrControl+,",
    click: () => send("openSettings")
  }
  const viewItems: MenuItemConstructorOptions[] = [
    {
      label: "Actions",
      accelerator: "CommandOrControl+P",
      click: () => send("toggleActionPanel")
    },
    {
      label: "Toggle Library",
      accelerator: "CommandOrControl+B",
      click: () => send("toggleLibrary")
    },
    {
      label: "Toggle Tools",
      accelerator: "CommandOrControl+E",
      click: () => send("toggleToolPane")
    },
    {
      label: "Toggle Note",
      accelerator: "CommandOrControl+`",
      click: () => send("toggleNote")
    }
  ]
  if (!app.isPackaged) {
    viewItems.push(
      { type: "separator" },
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" }
    )
  }
  viewItems.push({ type: "separator" }, { role: "togglefullscreen" })
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: viewItems
  }
  if (process.platform === "darwin") {
    return [
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          settingsItem,
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      },
      editMenuTemplate(window),
      viewMenu,
      { role: "windowMenu" }
    ]
  }
  return [
    {
      label: "File",
      submenu: [settingsItem, { type: "separator" }, { role: "quit" }]
    },
    editMenuTemplate(window),
    viewMenu,
    { role: "windowMenu" }
  ]
}
