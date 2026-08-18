# Doorei

A personal recall library for downloaded video courses. Search and Summary are why it exists; the player is how you watch and leave progress.

## Models

Shenava (Persian ASR), Parakeet int8 (English ASR), and multilingual-e5-small qint8 ship in the app bundle. They are not downloaded from Hugging Face at first launch.

```sh
pnpm fetch-models   # once, before packaging or a full local run
pnpm dev
```

`pnpm fetch-models` writes only the allowlisted files into `resources/models` (gitignored). Electron Builder copies that folder to `extraResources`. Re-run it when `MODEL_PACK_VERSION` or the file list in `src/library/models.ts` changes.

## Release

Push a version tag to package macOS (dmg), Linux (AppImage), and Windows (nsis) installers and attach them to a GitHub Release. The packaged app then checks GitHub for updates and downloads a slim package that omits the model pack:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Optional signing secrets (Settings → Secrets and variables → Actions):

- **macOS:** `CSC_LINK` (base64 Developer ID `.p12`), `CSC_KEY_PASSWORD`, and for notarization `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- **Windows:** `WIN_CSC_LINK` (base64 Authenticode `.pfx`), `WIN_CSC_KEY_PASSWORD`

Without them the installers are unsigned. macOS in-app update needs a signed app.
