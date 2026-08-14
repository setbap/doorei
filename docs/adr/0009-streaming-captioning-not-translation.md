# Captioning streams into Caption; Spoken language is per Video

ASR writes Caption as segments arrive so playback can show subtitles before the file is finished. That job’s progress is persisted and is not Playback Position. Captioning is not translation; FA/EN translation, if ever added, is a later Provider pass.

Spoken language is chosen when adding a Video (default from App settings). Captioning does not start until that language’s ASR Model is fully on disk. Persian uses Shenava Koochik (`Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16`). English uses Parakeet TDT 0.6B v3 in ONNX (`istupakov/parakeet-tdt-0.6b-v3-onnx`, from `nvidia/parakeet-tdt-0.6b-v3`). Shenava is never run on English.
