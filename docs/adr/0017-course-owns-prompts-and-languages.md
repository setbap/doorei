# Improve, Summary, and Ask prompts, plus Output language and Spoken language default, belong to a Course

Courses do not share a language situation: one Course may be Persian speech with English Ask, another the reverse. App-wide prompts and languages made that impossible. Each Course stores Output language, Spoken language default (used when a Video is added), and the Improve / Summary / Ask prompts. App language, Provider, and player settings stay app-wide. Changing a Course’s prompts or Output language does not rewrite existing Summaries; changing Spoken language default does not retag existing Videos.

## Considered options

- **Keep globals, copy into a Course only when needed** — still one template for every new Course, and Settings would fight the Course form.
- **Store prompts only in the Course SQLite file** — embeddings and Captions belong there (ADR-0015); these fields are small and needed in the Course index, so they live on `app.sqlite` `courses`.
