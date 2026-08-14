import { useEffect, useState } from "react"
import type { LibrarySnapshot } from "../../library/types.js"
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

  if (!snapshot) {
    return <div className="flex h-full items-center justify-center text-zinc-400">Doorei</div>
  }

  if (!snapshot.usable) {
    return <Welcome snapshot={snapshot} />
  }

  return <Shell snapshot={snapshot} />
}
