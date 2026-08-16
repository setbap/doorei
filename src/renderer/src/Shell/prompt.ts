export type PromptState =
  | { kind: "course" }
  | { kind: "rename" }
  | { kind: "session" }
  | { kind: "rename-session"; id: string; name: string }
  | { kind: "delete-session"; id: string }
  | { kind: "note"; id: string; text: string }
  | { kind: "from-folder"; toDir: string }
  | { kind: "spoken"; sessionId: string; paths: string[] }
  | null
