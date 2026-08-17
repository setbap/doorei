import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  SHENAVA_BLANK_ID,
  SHENAVA_HOP_SAMPLES,
  SHENAVA_WINDOW_SAMPLES,
  argmaxLogits,
  captionShenavaWindow,
  createOnnxShenavaGraph,
  decodeShenavaCtc,
  keepWindowCues,
  loadShenavaSidecars,
  nativeFloat16Tensor,
  PcmWindowAssembler,
  runShenavaPcm,
  type ShenavaGraph
} from "../../src/adapters/shenava.js"

describe("Shenava CTC decode", () => {
  test("greedy CTC collapses repeats and blank into a Caption cue", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[10] = "▁سلام"
    tokens[11] = "▁دنیا"
    const segments = decodeShenavaCtc(
      [10, 10, SHENAVA_BLANK_ID, 11, 11, SHENAVA_BLANK_ID],
      tokens,
      0
    )
    expect(segments).toEqual([{ startSeconds: 0, endSeconds: 0.4, text: "سلام دنیا" }])
  })

  test("a 480ms gap stays in the same Caption cue", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[10] = "▁سلام"
    tokens[11] = "▁دنیا"
    const segments = decodeShenavaCtc(
      [10, SHENAVA_BLANK_ID, SHENAVA_BLANK_ID, SHENAVA_BLANK_ID, SHENAVA_BLANK_ID, SHENAVA_BLANK_ID, SHENAVA_BLANK_ID, 11],
      tokens,
      0
    )
    expect(segments).toEqual([{ startSeconds: 0, endSeconds: 0.64, text: "سلام دنیا" }])
  })

  test("a pause of 960ms starts a new Caption cue", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[10] = "▁سلام"
    tokens[11] = "▁دنیا"
    const segments = decodeShenavaCtc(
      [
        10,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        SHENAVA_BLANK_ID,
        11
      ],
      tokens,
      0
    )
    expect(segments).toEqual([
      { startSeconds: 0, endSeconds: 0.08, text: "سلام" },
      { startSeconds: 1.04, endSeconds: 1.12, text: "دنیا" }
    ])
  })

  test("words without a pause stay in one cue up to 24 words", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    const ids: number[] = []
    for (let i = 0; i < 25; i += 1) {
      tokens[10 + i] = `▁و${i}`
      ids.push(10 + i)
    }
    const segments = decodeShenavaCtc(ids, tokens, 0)
    expect(segments).toHaveLength(2)
    expect(segments[0]?.text.split(" ")).toHaveLength(24)
    expect(segments[1]?.text).toBe("و24")
  })

  test("SentencePiece specials are dropped and window offset is applied", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[0] = "<unk>"
    tokens[2] = "<spk1>"
    tokens[10] = "▁سلام"
    const segments = decodeShenavaCtc([0, 10, 2, 10], tokens, 20.04)
    expect(segments).toEqual([{ startSeconds: 20.12, endSeconds: 20.36, text: "سلام سلام" }])
  })
})

describe("Shenava windowed Captioning", () => {
  test("cues in the outer half of a 2s overlap are dropped except at the ends", () => {
    const cues = [
      { startSeconds: 0.4, endSeconds: 0.6, text: "early" },
      { startSeconds: 10, endSeconds: 10.5, text: "mid" },
      { startSeconds: 19.4, endSeconds: 19.6, text: "late" }
    ]
    expect(
      keepWindowCues(cues, { windowStartSeconds: 0, windowSeconds: 20.04, isFirst: false, isLast: false }).map(
        (cue) => cue.text
      )
    ).toEqual(["mid"])
    expect(
      keepWindowCues(cues, { windowStartSeconds: 0, windowSeconds: 20.04, isFirst: true, isLast: false }).map(
        (cue) => cue.text
      )
    ).toEqual(["early", "mid"])
    expect(
      keepWindowCues(
        [
          { startSeconds: 18.44, endSeconds: 18.64, text: "early" },
          { startSeconds: 28.04, endSeconds: 28.54, text: "mid" },
          { startSeconds: 37.44, endSeconds: 37.64, text: "late" }
        ],
        { windowStartSeconds: 18.04, windowSeconds: 20.04, isFirst: false, isLast: true }
      ).map((cue) => cue.text)
    ).toEqual(["mid", "late"])
  })

  test("a short last window still sends a full-size mel tensor", async () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[10] = "▁سلام"
    let melLength = 0
    let frames = 0
    const graph: ShenavaGraph = {
      async infer(mel, frameCount) {
        melLength = mel.length
        frames = frameCount
        return [10]
      }
    }
    await captionShenavaWindow(
      new Float32Array(1600),
      { graph, tokens, filters: dummyFilters() },
      { windowStartSeconds: 0, isFirst: true, isLast: true }
    )
    expect(melLength).toBe(80 * 2005)
    expect(frames).toBe(11)
  })

  test("a long Video is captioned in overlapping 2005-frame windows and streams segments", async () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[10] = "▁اول"
    tokens[11] = "▁دوم"
    const frameCounts: number[] = []
    const graph: ShenavaGraph = {
      async infer(_mel, frameCount) {
        frameCounts.push(frameCount)
        const id = frameCounts.length === 1 ? 10 : 11
        return Array.from({ length: Math.ceil(frameCount / 8) }, () => id)
      }
    }
    const pcm = new Float32Array(SHENAVA_WINDOW_SAMPLES + SHENAVA_HOP_SAMPLES)
    const texts: string[] = []
    const starts: number[] = []
    await runShenavaPcm(pcm, { graph, tokens, filters: dummyFilters() }, (segment) => {
      texts.push(segment.text)
      starts.push(segment.startSeconds)
    })
    expect(frameCounts).toEqual([2005, 2005])
    expect(texts).toEqual(["اول", "دوم"])
    expect(starts[0]).toBe(0)
    expect(starts[1]).toBe(SHENAVA_HOP_SAMPLES / 16000)
  })

  test("streamed PCM is assembled into overlapping windows without a trailing overlap duplicate", () => {
    const assembler = new PcmWindowAssembler()
    const pcm = new Float32Array(SHENAVA_WINDOW_SAMPLES + SHENAVA_HOP_SAMPLES)
    const windows = assembler.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))
    expect(windows).toHaveLength(2)
    expect(windows[0]?.pcm).toHaveLength(SHENAVA_WINDOW_SAMPLES)
    expect(windows[0]?.isFirst).toBe(true)
    expect(windows[1]?.offset).toBe(SHENAVA_HOP_SAMPLES)
    expect(windows[1]?.isLast).toBe(false)
    expect(assembler.flush()).toBeNull()
  })

  test("a short stream flushes as a single last window", () => {
    const assembler = new PcmWindowAssembler()
    const pcm = new Float32Array(16000)
    expect(assembler.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))).toEqual([])
    const last = assembler.flush()
    expect(last?.pcm).toHaveLength(16000)
    expect(last?.isFirst).toBe(true)
    expect(last?.isLast).toBe(true)
  })
})

describe("Shenava logits", () => {
  test("argmax over vocab yields one token id per output step", () => {
    const vocab = 4
    const steps = 3
    // row-major [steps, vocab]
    const logits = Float32Array.from([
      0, 3, 1, 0,
      9, 1, 0, 0,
      0, 0, 0, 5
    ])
    expect(argmaxLogits(logits, steps, vocab)).toEqual([1, 0, 3])
  })
})

describe("Shenava sidecars", () => {
  test("tokens.json and mel filters load from the bundled filenames", () => {
    const dir = mkdtempSync(join(tmpdir(), "shenava-sidecars-"))
    writeFileSync(
      join(dir, "tokens.json"),
      JSON.stringify({ blank_id: 1024, tokens: ["<unk>", "▁سلام"] })
    )
    writeFileSync(
      join(dir, "preprocessor.json"),
      JSON.stringify({
        hop_length: 160,
        fixed_frames: 2005,
        blank_id: 1024,
        n_mels: 80
      })
    )
    writeFileSync(
      join(dir, "mel_filters_slaney_80x257.json"),
      JSON.stringify(Array.from({ length: 80 }, () => Array.from({ length: 257 }, () => 0)))
    )
    const loaded = loadShenavaSidecars(dir)
    expect(loaded.tokens[1]).toBe("▁سلام")
    expect(loaded.filters).toHaveLength(80)
    expect(loaded.filters[0]).toHaveLength(257)
  })
})

describe("Shenava ONNX graph", () => {
  test("a float16 tensor exposes Uint16Array bits without Float16Array", () => {
    const tensor = nativeFloat16Tensor(Float32Array.from([-10, 0, 1]), [3])
    expect(tensor.type).toBe("float16")
    expect(tensor.data).toBeInstanceOf(Uint16Array)
    expect(tensor.data).toHaveLength(3)
  })

  test("a full-window mel tensor infers token ids without a float16 buffer error", async () => {
    const modelDir = join(
      process.cwd(),
      "resources/models",
      "Reza2kn--Shenava-Koochik-v1.0-ONNX-fp16"
    )
    const onnxReady =
      existsSync(modelDir) && readdirSync(modelDir).some((name) => name.endsWith("_embedded.onnx"))
    if (!onnxReady) return
    const graph = await createOnnxShenavaGraph(modelDir)
    const mel = new Float32Array(80 * 2005)
    mel.fill(-10)
    const ids = await graph.infer(mel, 2005)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => Number.isInteger(id) && id >= 0 && id < 1025)).toBe(true)
  }, 30_000)
})

function dummyFilters(): number[][] {
  return Array.from({ length: 80 }, () => Array.from({ length: 257 }, () => 0))
}
