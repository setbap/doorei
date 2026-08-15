import { Menu, app, type BrowserWindow, type MenuItemConstructorOptions } from "electron"
import { shortcutFromInput, type ShortcutId } from "./shortcuts.js"

export function installShortcuts(
  window: BrowserWindow,
  send: (id: ShortcutId) => void
): void {
  window.webContents.on("before-input-event", (event, input) => {
    const action = shortcutFromInput(input)
    if (!action) return
    event.preventDefault()
    send(action)
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(send)))
}

function appMenuTemplate(send: (id: ShortcutId) => void): MenuItemConstructorOptions[] {
  const settingsItem: MenuItemConstructorOptions = {
    label: "Settings",
    accelerator: "CommandOrControl+,",
    click: () => send("openSettings")
  }
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
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
        accelerator: "CommandOrControl+J",
        click: () => send("toggleToolPane")
      },
      {
        label: "Toggle Note",
        accelerator: "CommandOrControl+`",
        click: () => send("toggleNote")
      },
      { type: "separator" },
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" }
    ]
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
      { role: "editMenu" },
      viewMenu,
      { role: "windowMenu" }
    ]
  }
  return [
    {
      label: "File",
      submenu: [settingsItem, { type: "separator" }, { role: "quit" }]
    },
    { role: "editMenu" },
    viewMenu,
    { role: "windowMenu" }
  ]
}
