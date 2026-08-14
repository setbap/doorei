## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles map 1:1 to `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Cursor Cloud specific instructions

`.cursor/environment.json` runs `pnpm install && pnpm fetch-models`, so dependencies and the bundled ASR/embedding models under `resources/models` are already present. Checks run headlessly: `pnpm typecheck`, `pnpm test`, `pnpm build`.

Doorei is an Electron desktop app. To launch it in a headless VM, run it under a virtual display and disable the Chromium sandbox:

```sh
Xvfb :99 -screen 0 1440x900x24 &
DISPLAY=:99 ./node_modules/electron/dist/electron . --no-sandbox   # after pnpm build
```

The `dbus`, `vaapi`, and `dri3` warnings it prints are expected under Xvfb and are not failures. Capture the window with `ffmpeg -f x11grab -video_size 1440x900 -i :99 -frames:v 1 shot.png`.
