import { describe, expect, test } from "vitest"
import {
  MODEL_FILES,
  MODEL_HUB_LINKS,
  MODEL_PACK_VERSION,
  REQUIRED_MODELS,
  destFilesForModel,
  hubUrlForModel
} from "../../src/library/index.js"

describe("bundled model pack", () => {
  test("pack version is a non-empty string", () => {
    expect(MODEL_PACK_VERSION.length).toBeGreaterThan(0)
  })

  test("Parakeet ships int8 encoder and decoder only", () => {
    const dest = destFilesForModel(REQUIRED_MODELS.parakeet)
    expect(dest).toEqual([
      "encoder-model.int8.onnx",
      "decoder_joint-model.int8.onnx",
      "vocab.txt"
    ])
    expect(dest.join(" ")).not.toContain("encoder-model.onnx")
    expect(dest.join(" ")).not.toContain(".onnx.data")
  })

  test("Shenava ships the embedded ONNX, not the split weights", () => {
    const dest = destFilesForModel(REQUIRED_MODELS.shenava)
    expect(dest.some((file) => file.endsWith("_embedded.onnx"))).toBe(true)
    expect(dest.join(" ")).not.toContain(".onnx.data")
    expect(dest.filter((file) => file.endsWith(".onnx"))).toHaveLength(1)
  })

  test("Embedding Model ships the qint8 ONNX as model_quantized.onnx", () => {
    const files = MODEL_FILES.embedding
    expect(files.some((file) => file.repoPath === "onnx/model_qint8_avx512_vnni.onnx")).toBe(true)
    expect(destFilesForModel(REQUIRED_MODELS.embedding)).toContain("onnx/model_quantized.onnx")
    expect(destFilesForModel(REQUIRED_MODELS.embedding).join(" ")).not.toContain("model.safetensors")
    expect(destFilesForModel(REQUIRED_MODELS.embedding).join(" ")).not.toContain("pytorch_model.bin")
  })

  test("each required model has a Hugging Face repo link", () => {
    const ids = MODEL_HUB_LINKS.map((link) => link.id).sort()
    expect(ids).toEqual(Object.values(REQUIRED_MODELS).slice().sort())
    for (const link of MODEL_HUB_LINKS) {
      expect(hubUrlForModel(link.id)).toBe(link.url)
      expect(link.url).toMatch(/^https:\/\/huggingface\.co\//)
    }
  })
})
