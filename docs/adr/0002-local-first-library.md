# The Library stays on disk; network is only a configured LLM

Captions, summaries, notes, embeddings, and search run locally. The only optional network call is an LLM the user configured (OpenAI-compatible or local). A cloud search index or hosted vector store would send lecture text off the machine by default, which this app refuses.
