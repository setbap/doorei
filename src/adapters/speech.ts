import { execFile } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { REQUIRED_MODELS, type CaptionSegment, type SpeechRecognizer } from "../library/index.js"
import { modelDir } from "./modelStore.js"

const execFileAsync = promisify(execFile)

export function createSpeechRecognizer(modelsRoot: string): SpeechRecognizer {
  return {
    async caption({ modelId, videoPath, onSegment }) {
      const pcm = await extractPcm16k(videoPath)
      if (modelId === REQUIRED_MODELS.parakeet) {
        await runParakeet(modelDir(modelsRoot, modelId), pcm, onSegment)
        return
      }
      if (modelId === REQUIRED_MODELS.shenava) {
        await runShenava(modelDir(modelsRoot, modelId), pcm, onSegment)
        return
      }
      throw new Error(`Unknown ASR Model: ${modelId}`)
    }
  }
}

async function extractPcm16k(videoPath: string): Promise<Float32Array> {
  const ffmpeg = await resolveFfmpeg()
  const { stdout } = await execFileAsync(
    ffmpeg,
    ["-i", videoPath, "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 512 }
  )
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4)
}

async function resolveFfmpeg(): Promise<string> {
  try {
    const mod = await import("ffmpeg-static")
    const path = (mod.default ?? mod) as unknown as string | null
    if (path) return path
  } catch {
    /* fall through */
  }
  return "ffmpeg"
}

async function runParakeet(
  modelPath: string,
  pcm: Float32Array,
  onSegment: (segment: CaptionSegment) => void | Promise<void>
): Promise<void> {
  try {
    const parakeet = await import("parakeet.js")
    const decoder =
      firstExisting(modelPath, ["decoder_joint-model.int8.onnx", "decoder_joint-model.onnx"]) ??
      ""
    const encoder =
      firstExisting(modelPath, ["encoder-model.int8.onnx", "encoder-model.onnx"]) ?? ""
    const model = await parakeet.fromUrls({
      encoderUrl: pathToFileUrl(encoder),
      decoderUrl: pathToFileUrl(decoder),
      tokenizerUrl: pathToFileUrl(join(modelPath, "vocab.txt")),
      backend: "wasm",
      preprocessorBackend: "js"
    })
    const result = (await model.transcribe(pcm, 16000, { returnTimestamps: true })) as {
      utterance_text?: string
      text?: string
      chunks?: { text: string; start: number; end: number }[]
    }
    const chunks = result.chunks ?? [
      {
        text: result.utterance_text ?? result.text ?? "",
        start: 0,
        end: pcm.length / 16000
      }
    ]
    for (const chunk of chunks) {
      const text = chunk.text?.trim()
      if (!text) continue
      await onSegment({
        startSeconds: chunk.start ?? 0,
        endSeconds: chunk.end ?? chunk.start ?? 0,
        text
      })
    }
  } catch (error) {
    throw new Error(
      `Parakeet Captioning failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function runShenava(
  modelPath: string,
  pcm: Float32Array,
  onSegment: (segment: CaptionSegment) => void | Promise<void>
): Promise<void> {
  const wavPath = writeTempWav(pcm)
  try {
    const transformers = await import("@huggingface/transformers")
    const asr = await transformers.pipeline("automatic-speech-recognition", modelPath, {
      local_files_only: true
    })
    const result = (await asr(wavPath, { return_timestamps: true })) as {
      text?: string
      chunks?: { text: string; timestamp: [number, number] }[]
    }
    if (result.chunks?.length) {
      for (const chunk of result.chunks) {
        const text = chunk.text?.trim()
        if (!text) continue
        await onSegment({
          startSeconds: chunk.timestamp?.[0] ?? 0,
          endSeconds: chunk.timestamp?.[1] ?? 0,
          text
        })
      }
      return
    }
    if (result.text?.trim()) {
      await onSegment({
        startSeconds: 0,
        endSeconds: pcm.length / 16000,
        text: result.text.trim()
      })
    }
  } catch (error) {
    throw new Error(
      `Shenava Captioning failed: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    rmSync(wavPath, { force: true })
  }
}

function firstExisting(dir: string, names: string[]): string | null {
  for (const name of names) {
    const files = readdirSync(dir)
    if (files.includes(name)) return join(dir, name)
  }
  return null
}

function writeTempWav(pcm: Float32Array): string {
  const dir = mkdtempSync(join(tmpdir(), "doorei-asr-"))
  const path = join(dir, "audio.wav")
  const dataSize = pcm.length * 2
  const header = Buffer.alloc(44)
  const int16 = Buffer.alloc(dataSize)
  for (let i = 0; i < pcm.length; i += 1) {
    const s = Math.max(-1, Math.min(1, pcm[i] ?? 0))
    int16.writeInt16LE(Math.round(s * 32767), i * 2)
  }
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)
  writeFileSync(path, Buffer.concat([header, int16]))
  return path
}

function pathToFileUrl(path: string): string {
  const prefix = process.platform === "win32" ? "file:///" : "file://"
  return prefix + path.replaceAll("\\", "/")
}
