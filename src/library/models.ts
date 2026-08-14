export const MODEL_PACK_VERSION = "1"

export const REQUIRED_MODELS = {
  shenava: "Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16",
  parakeet: "istupakov/parakeet-tdt-0.6b-v3-onnx",
  embedding: "intfloat/multilingual-e5-small"
} as const

export type RequiredModelKey = keyof typeof REQUIRED_MODELS
export type RequiredModelId = (typeof REQUIRED_MODELS)[RequiredModelKey]

export type ModelPackFile = {
  repoPath: string
  destPath: string
}

export const MODEL_FILES: Record<RequiredModelKey, ModelPackFile[]> = {
  shenava: [
    { repoPath: "preprocessor.json", destPath: "preprocessor.json" },
    { repoPath: "tokens.json", destPath: "tokens.json" },
    { repoPath: "mel_filters_slaney_80x257.json", destPath: "mel_filters_slaney_80x257.json" },
    { repoPath: "export_manifest.json", destPath: "export_manifest.json" },
    {
      repoPath: "shenava_koochik_1_0_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx",
      destPath: "shenava_koochik_1_0_ctc_fixed2005_len_att70_13_fp16_full_io_embedded.onnx"
    }
  ],
  parakeet: [
    { repoPath: "encoder-model.int8.onnx", destPath: "encoder-model.int8.onnx" },
    { repoPath: "decoder_joint-model.int8.onnx", destPath: "decoder_joint-model.int8.onnx" },
    { repoPath: "vocab.txt", destPath: "vocab.txt" }
  ],
  embedding: [
    { repoPath: "config.json", destPath: "config.json" },
    { repoPath: "tokenizer.json", destPath: "tokenizer.json" },
    { repoPath: "tokenizer_config.json", destPath: "tokenizer_config.json" },
    { repoPath: "special_tokens_map.json", destPath: "special_tokens_map.json" },
    {
      repoPath: "onnx/model_qint8_avx512_vnni.onnx",
      destPath: "onnx/model_quantized.onnx"
    }
  ]
}

export const MODEL_HUB_LINKS: { id: RequiredModelId; name: string; url: string }[] = [
  {
    id: REQUIRED_MODELS.shenava,
    name: "Shenava",
    url: "https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16"
  },
  {
    id: REQUIRED_MODELS.parakeet,
    name: "Parakeet",
    url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx"
  },
  {
    id: REQUIRED_MODELS.embedding,
    name: "multilingual-e5-small",
    url: "https://huggingface.co/intfloat/multilingual-e5-small"
  }
]

export function modelKeyForId(modelId: string): RequiredModelKey | null {
  for (const [key, id] of Object.entries(REQUIRED_MODELS) as [RequiredModelKey, RequiredModelId][]) {
    if (id === modelId) return key
  }
  return null
}

export function destFilesForModel(modelId: string): string[] {
  const key = modelKeyForId(modelId)
  return key ? MODEL_FILES[key].map((file) => file.destPath) : []
}

export function hubUrlForModel(modelId: string): string {
  return MODEL_HUB_LINKS.find((link) => link.id === modelId)?.url ?? `https://huggingface.co/${modelId}`
}
