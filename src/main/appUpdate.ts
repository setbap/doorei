export type AppUpdateStatus =
  | { kind: "idle" }
  | { kind: "disabled" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string }

export type AppUpdateEvent =
  | { type: "disable" }
  | { type: "check" }
  | { type: "current" }
  | { type: "available"; version: string }
  | { type: "progress"; version: string; percent: number }
  | { type: "ready"; version: string }
  | { type: "error"; message: string }
  | { type: "clearError" }

export function applyAppUpdateEvent(status: AppUpdateStatus, event: AppUpdateEvent): AppUpdateStatus {
  if (event.type === "disable") return { kind: "disabled" }
  if (status.kind === "disabled") return status
  switch (event.type) {
    case "check":
      return { kind: "checking" }
    case "current":
      return { kind: "current" }
    case "available":
      return { kind: "available", version: event.version }
    case "progress":
      return { kind: "downloading", version: event.version, percent: event.percent }
    case "ready":
      return { kind: "ready", version: event.version }
    case "error":
      return { kind: "error", message: event.message }
    case "clearError":
      return status.kind === "error" ? { kind: "idle" } : status
  }
}
