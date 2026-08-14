# Bundled models

Required ASR and Embedding Model files are not in git. They are fetched into this folder, then copied into the packaged app as `extraResources` (`Resources/models` on macOS).

```sh
pnpm fetch-models
```

That command downloads only the allowlisted files in `src/library/models.ts`:

- Shenava: embedded ONNX plus tokenizer/preprocessor JSON
- Parakeet: int8 encoder, int8 decoder, `vocab.txt`
- multilingual-e5-small: tokenizer/config plus the qint8 ONNX saved as `onnx/model_quantized.onnx`

Files already on disk with a matching size are skipped. Re-run after bumping `MODEL_PACK_VERSION` or changing the allowlist; extra files in this folder are removed.

The desktop app reads these files from the bundle. There is no in-app Hugging Face download.
