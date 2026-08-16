import { selectAllBehavior } from "../../main/selectAll.js"

function elementFrom(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function selectElementContents(root: Element): void {
  const range = document.createRange()
  range.selectNodeContents(root)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function applySelectAll(target: EventTarget | null = document.activeElement): void {
  const el = elementFrom(target)
  const behavior = selectAllBehavior({
    tagName: el?.tagName ?? "",
    isContentEditable: el?.isContentEditable ?? false,
    inSelectable: Boolean(el?.closest("[data-selectable]"))
  })
  if (behavior === "native") {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select()
    }
    return
  }
  if (behavior === "block" && el) {
    const root = el.closest("[data-selectable]")
    if (root) selectElementContents(root)
    return
  }
  window.getSelection()?.removeAllRanges()
}

export function handleSelectAllKey(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
  if (event.key.toLowerCase() !== "a") return
  const el = elementFrom(event.target)
  const behavior = selectAllBehavior({
    tagName: el?.tagName ?? "",
    isContentEditable: el?.isContentEditable ?? false,
    inSelectable: Boolean(el?.closest("[data-selectable]"))
  })
  if (behavior === "native") return
  event.preventDefault()
  applySelectAll(event.target)
}

export function blockPageZoom(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) event.preventDefault()
}
