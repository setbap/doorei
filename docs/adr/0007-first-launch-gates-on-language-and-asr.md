# First launch requires App language, both ASR Models, and the Embedding Model

The Library is blocked until the user picks App language (default Persian) and every file of Shenava (Persian ASR), Parakeet TDT 0.6B v3 ONNX (English ASR), and the Embedding Model is on disk. LLM Provider setup is offered on the same screen and is optional. Downloading English ASR up front means adding an English Video does not stall on a second download. Skipping any required model would let Captioning or semantic Search fail in the main window; making Provider required would block a Search-only user.
