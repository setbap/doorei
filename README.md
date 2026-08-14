# Doorei

A personal recall library for downloaded video courses. Search and Summary are why it exists; the player is how you watch and leave progress.

## Models

Shenava (Persian ASR), Parakeet int8 (English ASR), and multilingual-e5-small qint8 ship in the app bundle. They are not downloaded from Hugging Face at first launch.

```sh
pnpm fetch-models   # once, before packaging or a full local run
pnpm dev
```

`pnpm fetch-models` writes only the allowlisted files into `resources/models` (gitignored). Electron Builder copies that folder to `extraResources`. Re-run it when `MODEL_PACK_VERSION` or the file list in `src/library/models.ts` changes.
