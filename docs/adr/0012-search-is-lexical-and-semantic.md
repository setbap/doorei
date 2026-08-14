# Search is lexical and semantic; the Embedding Model is required at first launch

Recall needs both exact-term Hits and meaning Hits. Lexical Search works from Caption text alone; semantic Search and Ask retrieval need the Embedding Model (`intfloat/multilingual-e5-small`, Persian and English). That model is a first-launch requirement, same gate as the ASR Models, so the main window never opens without embeddings. Provider stays optional.
