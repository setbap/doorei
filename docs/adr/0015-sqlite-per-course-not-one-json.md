# Library data is SQLite per Course; embeddings are not JSON

The whole Library lived in one JSON file rewritten on every change, including Playback Position. An 80-Video Course then hitchs on launch and while watching, because vectors are stringified with the rest of the snapshot. Persistence uses Node’s bundled `sqlite` (already inside Electron; no extra native addon): a small app database plus one database per Course, opened when that Course is selected. Embeddings are binary blobs in the Course database, not JSON numbers. Playback and Ask update rows; they do not rewrite the Course.

## Considered options

- **One JSON file** — status quo; too slow at Course scale.
- **JSON per Course** — faster launch with many Courses, but watching still rewrites that Course’s Captions and vectors.
- **`better-sqlite3` or `sqlite-vec`** — native addons / loadable extensions per OS and arch, which this app refuses.
- **Hosted vector store** — refused by ADR-0002.
- **A second JS vector index** — not needed until Search is measured slow; cosine over one Course is enough.
