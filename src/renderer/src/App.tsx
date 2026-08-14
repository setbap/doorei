import { useEffect, useState } from "react"
import type { LibrarySnapshot } from "../../library/types.js"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Welcome } from "./Welcome"
import { Shell } from "./Shell"

export function App() {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null)

  useEffect(() => {
    void window.doorei.snapshot().then(setSnapshot)
    return window.doorei.subscribe(setSnapshot)
  }, [])

  useEffect(() => {
    if (!snapshot) return
    document.documentElement.lang = snapshot.appLanguage ?? "fa"
    document.documentElement.dir = snapshot.direction
  }, [snapshot])

  return (
    <TooltipProvider>
      {!snapshot ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">Doorei</div>
      ) : !snapshot.usable ? (
        <Welcome snapshot={snapshot} />
      ) : (
        <Shell snapshot={snapshot} />
      )}
    </TooltipProvider>
  )
}
