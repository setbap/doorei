// Full-window backdrop shared by Welcome and the main Shell. On macOS the window
// is transparent with native vibrancy, so we only lay a faint tint over it; on
// every other platform we paint the glassy noise gradient. Panels above render
// transparent so this shows through.
export function AppBackdrop({ nativeGlass }: { nativeGlass: boolean }) {
  if (nativeGlass) {
    return <div className="pointer-events-none absolute inset-0 bg-black/15" />
  }

  return (
    <div className="welcome-grain pointer-events-none absolute inset-0">
      <div className="absolute -top-24 start-[-10%] size-[36rem] rounded-lg bg-white/5 blur-3xl" />
      <div className="absolute -bottom-28 end-[-8%] size-[40rem] rounded-lg bg-black/70 blur-3xl" />
    </div>
  )
}
