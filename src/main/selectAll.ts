export type SelectAllBehavior = "native" | "block" | "prevent"

export function selectAllBehavior(target: {
  tagName: string
  isContentEditable: boolean
  inSelectable: boolean
}): SelectAllBehavior {
  const tag = target.tagName.toLowerCase()
  if (tag === "input" || tag === "textarea" || target.isContentEditable) {
    return "native"
  }
  if (target.inSelectable) return "block"
  return "prevent"
}
