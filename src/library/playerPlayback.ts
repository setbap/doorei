export function resumeSeconds(position: number, duration: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0
  if (!Number.isFinite(duration) || duration <= 0) return position
  if (position >= duration - 1) return 0
  return position
}

export function playAfterMediaReady(input: {
  selectedId: string
  mediaId: string | null
  playAfterId: string | null
}): boolean {
  return input.playAfterId === input.selectedId && input.mediaId === input.selectedId
}
