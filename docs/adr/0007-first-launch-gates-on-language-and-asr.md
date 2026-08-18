# First launch is a two-step welcome: intro, then models and languages

The Library is blocked until the user picks App language (default Persian) and every required file of Shenava (Persian ASR), Parakeet TDT 0.6B v3 ONNX int8 (English ASR), and the Embedding Model is on disk.

Those files ship in the app bundle (`extraResources`). Welcome does not download them. Step one is a short description of the app and a Get Started button. Step two has two panes: whether the bundled models are present, and language. Welcome collects App language (the UI). Spoken language default and Output language belong to each Course (ADR-0017), not Welcome. LLM Provider setup is not on Welcome; it stays optional in Settings. The Hugging Face repos for the three models are linked as one line under Open Library.

Shipping English ASR with the app means adding an English Video does not stall on a second download. Skipping any required model would let Captioning or semantic Search fail in the main window; making Provider required would block a Search-only user.
