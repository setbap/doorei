# Required models ship in the app bundle

The Library needs Shenava, Parakeet, and the Embedding Model on disk before it is usable. Downloading whole Hugging Face repos at first launch pulled duplicate ONNX/PyTorch files (multiple gigabytes) over a slow Hub connection.

The packaged app copies an allowlisted pack into `extraResources` (`Resources/models`): Shenava's embedded ONNX, Parakeet's int8 encoder/decoder, and multilingual-e5-small's qint8 ONNX (`onnx/model_quantized.onnx`). `pnpm fetch-models` fills `resources/models` at package time and skips files whose size already matches. The running app reads that bundle; there is no in-app download. A new model pack is a new app version (bump `MODEL_PACK_VERSION` and change `MODEL_FILES`). Weights stay out of git and out of asar so an app update that does not change the pack does not require a Hugging Face fetch.

Keeping a runtime Hub client would reintroduce the welcome download and the `@huggingface/hub` dependency. Hosting the weights only in `userData` would still force a first-launch network fetch.
