import { parentPort } from "node:worker_threads"
import {
  captionShenavaWindow,
  createOnnxShenavaGraph,
  loadShenavaSidecars,
  type ShenavaGraph
} from "./shenava.js"

type WorkerRequest =
  | { type: "init"; modelDir: string }
  | {
      type: "window"
      id: number
      pcm: Float32Array
      windowStartSeconds: number
      isFirst: boolean
      isLast: boolean
    }

type WorkerResponse =
  | { type: "ready" }
  | { type: "segments"; id: number; segments: Awaited<ReturnType<typeof captionShenavaWindow>> }
  | { type: "error"; id?: number; message: string }

let model: { graph: ShenavaGraph; tokens: string[]; filters: number[][] } | null = null

function post(msg: WorkerResponse): void {
  parentPort?.postMessage(msg)
}

parentPort?.on("message", (msg: WorkerRequest) => {
  void handle(msg)
})

async function handle(msg: WorkerRequest): Promise<void> {
  try {
    if (msg.type === "init") {
      const { tokens, filters } = loadShenavaSidecars(msg.modelDir)
      model = {
        graph: await createOnnxShenavaGraph(msg.modelDir),
        tokens,
        filters
      }
      post({ type: "ready" })
      return
    }
    if (!model) throw new Error("Shenava worker is not initialized")
    const segments = await captionShenavaWindow(msg.pcm, model, {
      windowStartSeconds: msg.windowStartSeconds,
      isFirst: msg.isFirst,
      isLast: msg.isLast
    })
    post({ type: "segments", id: msg.id, segments })
  } catch (error) {
    post({
      type: "error",
      id: msg.type === "window" ? msg.id : undefined,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
