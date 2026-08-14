# Doorei

A personal recall library for downloaded video courses. Search and summary are why it exists; the player is how the user watches and leaves progress.

## Language

### Library

**Library**:
The on-disk collection of Courses and all derived data. It never contains video bytes. It is unusable until App language is chosen and required ASR Models and the Embedding Model are on disk.
_Avoid_: vault, workspace, catalog, database

**Course**:
A named container of Sessions the user switches between.
_Avoid_: class, program, folder

**Session**:
An ordered group of Videos in a Course. The user may treat it as a day, a week, or a folder; order is required, date is optional.
_Avoid_: chapter, week, day, module, lesson, thread

**Video**:
An app record for one media file in a Session, with a position. It points at a file; it is not the file. It survives a missing file until relinked or deleted. It has a Spoken language, chosen when it is added.
_Avoid_: part, lecture, clip, episode, item

### Text

**Caption**:
Timed text attached to a Video, used as subtitles and as the source for later text work. It comes from an imported caption file or from Captioning, is stored so ASR is not re-run, and can be regenerated.
_Avoid_: subtitle, transcript, srt, vtt

**Captioning**:
Persisted work that streams ASR into a Video's Caption. It does not start until that Video's ASR Model is fully on disk. The user can play while it runs; progress survives quitting the app. A failure keeps the Video and any partial Caption, marks the job failed, shows a readable error, and can be retried. It is not translation, and it is not Playback Position.
_Avoid_: transcription job, live translate, progress

**Improved Caption**:
A timed rewrite of a Caption with corrected wording. Search, Ask, and Summary use it when it exists; so do subtitles. The original Caption is kept so improvement can be re-run without ASR. It stays in the Video's Spoken language.
_Avoid_: cleaned transcript, search text, normalized caption

**Summary**:
Generated review text for a Video, so the user can re-read what it covered without watching. Written in the Output language.
_Avoid_: recap, outline, notes, bullets

**Note**:
User-written text attached to a Video. A timestamp is optional. Search can find Notes. Deleting the Video deletes its Notes.
_Avoid_: comment, memo, annotation, old notes

**Composer**:
The input under the player for adding a Note. Timestamp is optional and on by default while playing.
_Avoid_: prompt, chat box

### Recall

**Search**:
Local retrieval over a Video, a Session, or a Course — lexical and semantic. Returns Hits you can jump to. Does not require a Provider.
_Avoid_: find, query

**Ask**:
A chat over a Video, a Session, or a Course that requires a Provider. Answers cite Hits you can jump to. Written in the Output language.
_Avoid_: RAG, chatbot, copilot, talk

**Hit**:
A place in a Video (Caption segment or Note) that Search or Ask can jump to.
_Avoid_: result, match, clip, snippet

### Playback

**Playback Position**:
The last place the user was in a Video's file.
_Avoid_: resume, progress, bookmark

**Watched**:
Whether the user has marked a Video as watched. Independent of Playback Position.
_Avoid_: completed, done, finished, seen

### Language and models

**App language**:
Language of the UI. Persian is RTL. Chosen on first launch before the Library is usable. Default Persian.
_Avoid_: locale, i18n

**Output language**:
Language of Summary and Ask. Defaults to App language. Independent of a Video's Spoken language.
_Avoid_: response language, target language

**Spoken language**:
The language of a Video's audio. Chosen when the Video is added, defaulting from App settings. It selects which ASR Model Captioning uses. Shenava is never used for English.
_Avoid_: audio language, transcript language

**ASR Model**:
A local speech-to-text model shipped with the app. Persian and English models must be on disk before the Library is usable. A Video's Spoken language selects which one Captioning uses.
_Avoid_: weights, checkpoint, engine

**Embedding Model**:
A local model that turns Caption text into vectors for semantic Search and Ask. It must be on disk before the Library is usable.
_Avoid_: encoder, vectorizer

**Provider**:
The LLM for Improved Caption, Summary, and Ask: an OpenAI-compatible endpoint, or an optional editor SDK. Missing Provider leaves those jobs off; Search still works. A failure shows a readable error and can be retried; a half-finished Improved Caption or Summary is not kept.
_Avoid_: backend, API, model
