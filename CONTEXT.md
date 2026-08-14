# Doorei

A personal recall library for downloaded video courses. Search and summary are why it exists; the player is how the user watches and leaves progress.

## Language

**Library**:
The on-disk collection of Courses and all derived data. It never contains video bytes.
_Avoid_: vault, workspace, catalog, database

**Course**:
A named container of Sessions the user switches between. Each Course has a spoken language.
_Avoid_: class, program, folder

**Session**:
An ordered group of Videos in a Course. The user may treat it as a day, a week, or a folder; order is required, date is optional.
_Avoid_: chapter, week, day, module, lesson, thread

**Video**:
An app record for one media file in a Session, with a position. It points at a file; it is not the file. It survives a missing file until relinked or deleted.
_Avoid_: part, lecture, clip, episode, item

**Caption**:
Timed text attached to a Video, used as subtitles and as the source for later text work. It comes from an imported caption file or from ASR, is stored so ASR is not re-run, and can be regenerated.
_Avoid_: subtitle, transcript, srt, vtt

**Improved Caption**:
A timed rewrite of a Caption with corrected wording. Search, Ask, and Summary use it when it exists; so do subtitles. The original Caption is kept so improvement can be re-run without ASR.
_Avoid_: cleaned transcript, search text, normalized caption

**Summary**:
Generated review text for a Video, so the user can re-read what it covered without watching.
_Avoid_: recap, outline, notes, bullets

**Note**:
User-written text attached to a Video. A timestamp is optional. Search can find Notes. Deleting the Video deletes its Notes.
_Avoid_: comment, memo, annotation, old notes

**Playback Position**:
The last place the user was in a Video's file.
_Avoid_: resume, progress, bookmark

**Watched**:
Whether the user has marked a Video as watched. Independent of Playback Position.
_Avoid_: completed, done, finished, seen

**Search**:
Local retrieval over a Video, a Session, or a Course. Returns Hits you can jump to. Does not require an LLM.
_Avoid_: find, query

**Ask**:
A chat over a Video, a Session, or a Course that requires an LLM. Answers cite Hits you can jump to.
_Avoid_: RAG, chatbot, copilot, talk

**Hit**:
A place in a Video (Caption segment or Note) that Search or Ask can jump to.
_Avoid_: result, match, clip, snippet
