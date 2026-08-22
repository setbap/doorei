import { useEffect, useState } from "react"

let time = 0
let raf = 0
let pending: number | null = null
const listeners = new Set<(value: number) => void>()

function flush(): void {
  raf = 0
  if (pending === null) return
  if (pending === time) {
    pending = null
    return
  }
  time = pending
  pending = null
  for (const listener of listeners) listener(time)
}

export function publishPlaybackTime(next: number): void {
  pending = next
  if (typeof requestAnimationFrame !== "function") {
    flush()
    return
  }
  if (raf) return
  raf = requestAnimationFrame(flush)
}

export function getPlaybackTime(): number {
  return time
}

export function resetPlaybackTime(next = 0): void {
  pending = null
  if (raf && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(raf)
    raf = 0
  }
  time = next
  for (const listener of listeners) listener(time)
}

export function subscribePlaybackTime(listener: (value: number) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePlaybackTime(): number {
  const [value, setValue] = useState(getPlaybackTime)
  useEffect(() => subscribePlaybackTime(setValue), [])
  return value
}
