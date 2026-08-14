declare module "ffmpeg-static" {
  const path: string | null
  export default path
}

declare module "parakeet.js" {
  export function fromUrls(options: {
    encoderUrl: string
    decoderUrl: string
    tokenizerUrl: string
    backend?: string
    preprocessorBackend?: string
  }): Promise<{
    transcribe: (
      pcm: Float32Array,
      sampleRate: number,
      options?: { returnTimestamps?: boolean }
    ) => Promise<{
      utterance_text?: string
      text?: string
      chunks?: { text: string; start: number; end: number }[]
    }>
  }>
}
