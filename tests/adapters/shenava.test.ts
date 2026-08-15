import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  SHENAVA_BLANK_ID,
  SHENAVA_WINDOW_SAMPLES,
  argmaxLogits,
  decodeShenavaCtc,
  loadShenavaSidecars,
  runShenavaPcm,
  type ShenavaGraph
} from "../../src/adapters/shenava.js"

describe("Shenava CTC decode", () => {
  test("greedy CTC collapses repeats and blank into timed Caption segments", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[10] = "▁سلام"
    tokens[11] = "▁دنیا"
    const segments = decodeShenavaCtc(
      [10, 10, SHENAVA_BLANK_ID, 11, 11, SHENAVA_BLANK_ID],
      tokens,
      0
    )
    expect(segments).toEqual([
      { startSeconds: 0, endSeconds: 0.16, text: "سلام" },
      { startSeconds: 0.24, endSeconds: 0.4, text: "دنیا" }
    ])
  })

  test("SentencePiece specials are dropped and window offset is applied", () => {
    const tokens = Array.from({ length: 1025 }, () => "")
    tokens[0] = "<unk>"
    tokens[2] = "<spk1>"
    tokens[10] = "▁سلام"
    const segments = decodeShenavaCtc([0, 10, 2, 10], tokens, 20.04)
    expect(segments).toEqual([
      { startSeconds: 20.12, endSeconds: 20.2, text: "سلام" },
      { startSeconds: 20.28, endSeconds: 20.36, text: "سلام" }
    ])
  })
})

describe("Shenava windowed Captioning", () => {
  test("a long Video is captioned in 2005-frame windows and streams segments", async () => {
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
    const pcm = new Float32Array(SHENAVA_WINDOW_SAMPLES * 2)
    const texts: string[] = []
    const starts: number[] = []
    await runShenavaPcm(pcm, { graph, tokens, filters: dummyFilters() }, (segment) => {
      texts.push(segment.text)
      starts.push(segment.startSeconds)
    })
    expect(frameCounts).toEqual([2005, 2005])
    expect(texts).toEqual(["اول", "دوم"])
    expect(starts[0]).toBe(0)
    expect(starts[1]).toBe(SHENAVA_WINDOW_SAMPLES / 16000)
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

function dummyFilters(): number[][] {
  return Array.from({ length: 80 }, () => Array.from({ length: 257 }, () => 0))
}
