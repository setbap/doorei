import { useEffect, useState } from "react"
import type { LibrarySnapshot } from "../../library/types.js"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Welcome } from "./Welcome"
import { Shell } from "./Shell"
import { UpdateBanner } from "./UpdateBanner"

export function App() {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null)

  useEffect(() => {
    void window.doorei.snapshot().then(setSnapshot)
    return window.doorei.subscribe(setSnapshot)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.platform = window.doorei.platform
  }, [])

  useEffect(() => {
    if (!snapshot) return
    document.documentElement.lang = snapshot.appLanguage ?? "fa"
    document.documentElement.dir = snapshot.direction
    document.documentElement.dataset.surface = snapshot.usable ? "shell" : "welcome"
  }, [snapshot])

  useEffect(() => {
    void window.doorei.checkForUpdate()
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col">
        <UpdateBanner lang={snapshot?.appLanguage ?? null} />
        <div className="min-h-0 flex-1">
          {!snapshot ? (
            <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
              Doorei
            </div>
          ) : !snapshot.usable ? (
            <Welcome snapshot={snapshot} />
          ) : (
            <Shell snapshot={snapshot} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
