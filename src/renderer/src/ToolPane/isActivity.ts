import type { Activity } from "../../../library/types.js"

export function isActivity(value: string | undefined): value is Activity {
  return (
    value === "search" ||
    value === "ask" ||
    value === "captions" ||
    value === "summary" ||
    value === "notes"
  )
}
