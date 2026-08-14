# Captioning streams into Caption and stores its own progress

ASR writes Caption as segments arrive so playback can show subtitles before the file is finished. That job’s progress is persisted and is not Playback Position. Captioning is not translation; FA/EN translation, if ever added, is a later Provider pass. Persian spoken language uses Shenava Koochik (`Reza2kn/Shenava-Koochik-v1.0-ONNX-fp16`). English spoken language uses Whisper small English with timestamps (`onnx-community/whisper-small.en_timestamped`), offered on first launch and required only if selected.
