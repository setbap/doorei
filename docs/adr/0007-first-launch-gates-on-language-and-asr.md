# First launch is a two-step welcome: intro, then models and languages

The Library is blocked until the user picks App language (default Persian) and every file of Shenava (Persian ASR), Parakeet TDT 0.6B v3 ONNX (English ASR), and the Embedding Model is on disk.

Welcome is two steps so the first screen stays short. Step one is a short description of the app and a Get Started button. Step two has two panes: download the required models, and set languages. Languages are separate controls: App language (the UI) and Spoken language (the default for Courses, which selects the ASR Model Captioning uses). Output language is not on Welcome; it defaults to App language and is changed in Settings. LLM Provider setup is not on Welcome; it stays optional in Settings.

Downloading English ASR up front means adding an English Video does not stall on a second download. Skipping any required model would let Captioning or semantic Search fail in the main window; making Provider required would block a Search-only user.
