import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { applySelectAll, blockPageZoom, handleSelectAllKey } from "./selectAll"
import "./index.css"

function DesktopRoot() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      handleSelectAllKey(event)
    }
    function onWheel(event: WheelEvent): void {
      blockPageZoom(event)
    }
    function onGesture(event: Event): void {
      event.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("wheel", onWheel, { passive: false, capture: true })
    window.addEventListener("gesturestart", onGesture)
    const stopSelectAll = window.doorei.onSelectAll(() => applySelectAll())
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("wheel", onWheel, true)
      window.removeEventListener("gesturestart", onGesture)
      stopSelectAll()
    }
  }, [])
  return <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopRoot />
  </StrictMode>
)
