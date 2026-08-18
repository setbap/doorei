import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeIcnsFromPng } from "../../src/main/writeIcns.js"

const png = join(process.cwd(), "build/mac.png")

describe("writeIcnsFromPng", () => {
  test.skipIf(process.platform !== "darwin" || !existsSync(png))(
    "writes an icns container from the macOS app icon PNG",
    () => {
      const dest = join(mkdtempSync(join(tmpdir(), "doorei-icns-")), "icon.icns")
      writeIcnsFromPng(png, dest)
      const bytes = readFileSync(dest)
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("icns")
      expect(bytes.length).toBeGreaterThan(1024)
    }
  )

  test("the macOS packager uses a committed ICNS so electron-builder skips PNG conversion", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      build: { mac: { icon: string } }
    }
    expect(pkg.build.mac.icon).toBe("build/icon.icns")
    const bytes = readFileSync(pkg.build.mac.icon)
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("icns")
    expect(bytes.length).toBeGreaterThan(1024)
  })
})
