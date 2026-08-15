# Ask is Conversations on a Course, not a single answer slot

Ask was specified as a chat but implemented as one global last answer with a per-call Video / Session / Course lock. The learner keeps several Conversations per Course; each turn retrieves Hits from the current Video, its Session, and the Course; “this Video” and “this Session” mean the Library selection at that turn. A Conversation-wide retrieval lock is too tight for follow-ups that change what “this” means; a Library-wide inbox fights the shell (Ask is about the Course you are in). Search stays a separate verb (ADR-0005).
