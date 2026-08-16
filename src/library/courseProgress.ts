export function courseWatchProgress(videos: { watched: boolean }[]): {
  watched: number
  total: number
  percent: number
  label: string
} {
  const total = videos.length
  const watched = videos.filter((video) => video.watched).length
  const percent = total === 0 ? 0 : Number(((watched / total) * 100).toFixed(1))
  return {
    watched,
    total,
    percent,
    label: `(${watched}/${total}) ${percent.toFixed(1)}%`
  }
}
