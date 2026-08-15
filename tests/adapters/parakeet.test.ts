import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  PARAKEET_HOP_SAMPLES,
  PARAKEET_WINDOW_SAMPLES,
  decodeParakeetTdt,
  keepWindowCues,
  loadParakeetVocab,
  runParakeetPcm,
  type ParakeetGraph
} from "../../src/adapters/parakeet.js"

describe("Parakeet TDT decode", () => {
  test("greedy TDT collapses tokens into a timed Caption cue", async () => {
    const tokens = Array.from({ length: 12 }, () => "")
    tokens[10] = "▁hello"
    tokens[11] = "▁world"
    const blankId = 4
    const segments = await decodeParakeetTdt(
      4,
      (frame) => {
        if (frame === 0) return { tokenId: 10, duration: 2 }
        if (frame === 2) return { tokenId: 11, duration: 2 }
        return { tokenId: blankId, duration: 1 }
      },
      tokens,
      blankId,
      0
    )
    expect(segments).toEqual([{ startSeconds: 0, endSeconds: 0.32, text: "hello world" }])
  })

  test("SentencePiece specials are dropped and window offset is applied", async () => {
    const tokens = Array.from({ length: 12 }, () => "")
    tokens[0] = "<unk>"
    tokens[10] = "▁hel"
    tokens[11] = "lo"
    const blankId = 4
    const segments = await decodeParakeetTdt(
      3,
      (frame) => {
        if (frame === 0) return { tokenId: 0, duration: 1 }
        if (frame === 1) return { tokenId: 10, duration: 1 }
        return { tokenId: 11, duration: 1 }
      },
      tokens,
      blankId,
      20.04
    )
    expect(segments).toEqual([{ startSeconds: 20.12, endSeconds: 20.28, text: "hello" }])
  })

  test("a pause of 480ms starts a new Caption cue", async () => {
    const tokens = Array.from({ length: 12 }, () => "")
    tokens[10] = "▁hello"
    tokens[11] = "▁world"
    const blankId = 4
    const segments = await decodeParakeetTdt(
      8,
      (frame) => {
        if (frame === 0) return { tokenId: 10, duration: 1 }
        if (frame === 7) return { tokenId: 11, duration: 1 }
        return { tokenId: blankId, duration: 1 }
      },
      tokens,
      blankId,
      0
    )
    expect(segments).toEqual([
      { startSeconds: 0, endSeconds: 0.08, text: "hello" },
      { startSeconds: 0.56, endSeconds: 0.64, text: "world" }
    ])
  })
})

describe("Parakeet windowed Captioning", () => {
  test("cues in the outer half of a 2s overlap are dropped except at the ends", () => {
    const cues = [
      { startSeconds: 0.4, endSeconds: 0.6, text: "early" },
      { startSeconds: 10, endSeconds: 10.5, text: "mid" },
      { startSeconds: 19.4, endSeconds: 19.6, text: "late" }
    ]
    expect(
      keepWindowCues(cues, { windowStartSeconds: 0, windowSeconds: 20, isFirst: false, isLast: false }).map(
        (cue) => cue.text
      )
    ).toEqual(["mid"])
    expect(
      keepWindowCues(cues, { windowStartSeconds: 0, windowSeconds: 20, isFirst: true, isLast: false }).map(
        (cue) => cue.text
      )
    ).toEqual(["early", "mid"])
  })

  test("a long Video is captioned in overlapping windows and streams segments", async () => {
    const tokens = Array.from({ length: 12 }, () => "")
    tokens[10] = "▁first"
    tokens[11] = "▁second"
    const blankId = 4
    let windows = 0
    const graph: ParakeetGraph = {
      async encode() {
        windows += 1
        return { frameCount: 250 }
      },
      async join(frameIndex) {
        if (frameIndex === 125) return { tokenId: windows === 1 ? 10 : 11, duration: 2 }
        if (frameIndex < 125) return { tokenId: blankId, duration: 125 - frameIndex }
        return { tokenId: blankId, duration: 1 }
      }
    }
    const pcm = new Float32Array(PARAKEET_WINDOW_SAMPLES + PARAKEET_HOP_SAMPLES)
    const texts: string[] = []
    const starts: number[] = []
    await runParakeetPcm(pcm, { graph, tokens, blankId }, (segment) => {
      texts.push(segment.text)
      starts.push(segment.startSeconds)
    })
    expect(windows).toBe(2)
    expect(texts).toEqual(["first", "second"])
    expect(starts[0]).toBe(10)
    expect(starts[1]).toBe(PARAKEET_HOP_SAMPLES / 16000 + 10)
  })
})

describe("Parakeet vocab", () => {
  test("vocab.txt maps token ids and finds the blank", () => {
    const dir = mkdtempSync(join(tmpdir(), "parakeet-vocab-"))
    writeFileSync(join(dir, "vocab.txt"), "<unk> 0\n▁hello 10\n  4\n")
    const loaded = loadParakeetVocab(dir)
    expect(loaded.tokens[10]).toBe("▁hello")
    expect(loaded.blankId).toBe(4)
  })
})

describe("Parakeet ONNX graph", () => {
  test("the bundled encoder infers frames from PCM", async () => {
    const modelDir = join(process.cwd(), "resources/models", "istupakov--parakeet-tdt-0.6b-v3-onnx")
    if (!existsSync(modelDir)) return
    const { createOnnxParakeetGraph } = await import("../../src/adapters/parakeet.js")
    const graph = await createOnnxParakeetGraph(modelDir)
    const encoded = await graph.encode(new Float32Array(16000))
    expect(encoded.frameCount).toBeGreaterThan(0)
  }, 120_000)
})
