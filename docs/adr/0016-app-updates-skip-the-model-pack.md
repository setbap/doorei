# App updates skip the model pack

First install ships the ASR and Embedding Model pack in `extraResources`. After launch the packaged app copies that pack into `userData/models` and reads it from there.

In-app updates (electron-updater, like VS Code) download a slim artifact with the model folder stripped. The pack already on disk is reused until `MODEL_PACK_VERSION` changes. A model-pack bump is a new app version whose full installer (and that update, if the bundle includes the new pack) copies the new files locally — still no Hugging Face fetch at runtime.

Putting the only copy of the weights in `userData` with no bundled first install would force a network fetch on first launch, which ADR 0013 rejected.
