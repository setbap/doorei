import { spawnSync } from "node:child_process"
import { describe, expect, test } from "vitest"
import { requireElectronUpdater } from "../../src/main/loadAutoUpdater.js"

describe("loadAutoUpdater", () => {
  test("named ESM import of electron-updater fails the way packaged Electron does", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", 'import { autoUpdater } from "electron-updater"'],
      { encoding: "utf8", cwd: process.cwd() }
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Named export 'autoUpdater' not found")
  })

  test("CommonJS require sees autoUpdater without a named ESM import", () => {
    const mod = requireElectronUpdater()
    expect("autoUpdater" in mod).toBe(true)
  })
})
