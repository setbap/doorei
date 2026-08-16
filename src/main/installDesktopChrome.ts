import {
  Menu,
  app,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from "electron"

export function installDesktopChrome(window: BrowserWindow): void {
  const contents = window.webContents
  const packaged = app.isPackaged

  void contents.setVisualZoomLevelLimits(1, 1)
  contents.setZoomFactor(1)
  contents.on("zoom-changed", () => {
    contents.setZoomFactor(1)
  })

  contents.on("will-navigate", (event) => {
    event.preventDefault()
  })
  contents.on("will-attach-webview", (event) => {
    event.preventDefault()
  })
  contents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: "deny" }
  })

  if (packaged) {
    contents.on("devtools-opened", () => {
      contents.closeDevTools()
    })
  }

  contents.on("context-menu", (event, params) => {
    event.preventDefault()
    const template: MenuItemConstructorOptions[] = []
    if (params.isEditable) {
      template.push(
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { type: "separator" },
        { role: "selectAll", enabled: params.editFlags.canSelectAll }
      )
    } else if (params.selectionText.trim()) {
      template.push({ role: "copy" })
    }
    if (!packaged) {
      if (template.length > 0) template.push({ type: "separator" })
      template.push({
        label: "Inspect",
        click: () => contents.inspectElement(params.x, params.y)
      })
    }
    if (template.length === 0) return
    Menu.buildFromTemplate(template).popup({ window, x: params.x, y: params.y })
  })
}

export function editMenuTemplate(window: BrowserWindow): MenuItemConstructorOptions {
  return {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      {
        label: "Select All",
        accelerator: "CommandOrControl+A",
        registerAccelerator: false,
        click: () => window.webContents.send("edit:selectAll")
      }
    ]
  }
}
