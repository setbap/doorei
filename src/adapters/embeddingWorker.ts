import { parentPort } from "node:worker_threads"

type WorkerRequest =
  | { type: "init"; modelDir: string }
  | { type: "embed"; id: number; texts: string[] }

type WorkerResponse =
  | { type: "ready" }
  | { type: "vectors"; id: number; vectors: number[][] }
  | { type: "error"; id?: number; message: string }

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true }
) => Promise<{ tolist(): number[][] }>

let extractor: Extractor | null = null

function post(msg: WorkerResponse): void {
  parentPort?.postMessage(msg)
}

parentPort?.on("message", (msg: WorkerRequest) => {
  void handle(msg)
})

async function handle(msg: WorkerRequest): Promise<void> {
  try {
    if (msg.type === "init") {
      const transformers = await import("@huggingface/transformers")
      extractor = (await transformers.pipeline("feature-extraction", msg.modelDir, {
        local_files_only: true,
        dtype: "q8"
      })) as Extractor
      post({ type: "ready" })
      return
    }
    if (!extractor) throw new Error("Embedding worker is not initialized")
    const result = await extractor(msg.texts, { pooling: "mean", normalize: true })
    post({ type: "vectors", id: msg.id, vectors: result.tolist() })
  } catch (error) {
    post({
      type: "error",
      id: msg.type === "embed" ? msg.id : undefined,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
