# One Provider: OpenAI-compatible endpoint, plus optional editor SDKs

Improved Caption, Summary, and Ask share one active Provider. Local and hosted LLMs are the same shape: an OpenAI-compatible URL (and key if needed). Extra options are editor SDKs that expose a compatible call (Codex, OpenCode, and the Cursor SDK). Claude Code is out of scope. Each job has its own customizable prompt. A missing Provider turns those jobs off; Search still runs. Separate “local vs cloud” clients would duplicate the same protocol.
