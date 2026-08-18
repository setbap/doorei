import { describe, expect, test } from "vitest"
import { applyAppUpdateEvent, type AppUpdateStatus } from "../../src/main/appUpdate.js"

const idle: AppUpdateStatus = { kind: "idle" }

describe("applyAppUpdateEvent", () => {
  test("unpackaged apps stay disabled through every updater event", () => {
    const disabled = applyAppUpdateEvent(idle, { type: "disable" })
    expect(disabled).toEqual({ kind: "disabled" })
    expect(applyAppUpdateEvent(disabled, { type: "check" })).toEqual({ kind: "disabled" })
    expect(applyAppUpdateEvent(disabled, { type: "available", version: "0.2.0" })).toEqual({
      kind: "disabled"
    })
    expect(applyAppUpdateEvent(disabled, { type: "error", message: "network" })).toEqual({
      kind: "disabled"
    })
  })

  test("check, download progress, and ready follow the in-app update path", () => {
    let status = applyAppUpdateEvent(idle, { type: "check" })
    expect(status).toEqual({ kind: "checking" })

    status = applyAppUpdateEvent(status, { type: "available", version: "0.2.0" })
    expect(status).toEqual({ kind: "available", version: "0.2.0" })

    status = applyAppUpdateEvent(status, { type: "progress", version: "0.2.0", percent: 42 })
    expect(status).toEqual({ kind: "downloading", version: "0.2.0", percent: 42 })

    status = applyAppUpdateEvent(status, { type: "ready", version: "0.2.0" })
    expect(status).toEqual({ kind: "ready", version: "0.2.0" })
  })

  test("a current version and a failed check are visible states", () => {
    expect(applyAppUpdateEvent({ kind: "checking" }, { type: "current" })).toEqual({
      kind: "current"
    })
    expect(
      applyAppUpdateEvent({ kind: "checking" }, { type: "error", message: "timed out" })
    ).toEqual({ kind: "error", message: "timed out" })
    expect(
      applyAppUpdateEvent({ kind: "error", message: "timed out" }, { type: "clearError" })
    ).toEqual({ kind: "idle" })
  })
})
