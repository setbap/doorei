export const REQUIRED_MODELS = {
  shenava: "Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16",
  parakeet: "istupakov/parakeet-tdt-0.6b-v3-onnx",
  embedding: "intfloat/multilingual-e5-small"
} as const

export type RequiredModelKey = keyof typeof REQUIRED_MODELS
