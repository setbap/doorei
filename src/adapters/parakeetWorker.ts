import { parentPort } from "node:worker_threads"
import {
  captionParakeetWindow,
  createOnnxParakeetGraph,
  loadParakeetVocab,
  type ParakeetGraph
} from "./parakeet.js"

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
  | { type: "segments"; id: number; segments: Awaited<ReturnType<typeof captionParakeetWindow>> }
  | { type: "error"; id?: number; message: string }

let model: { graph: ParakeetGraph; tokens: string[]; blankId: number } | null = null

function post(msg: WorkerResponse): void {
  parentPort?.postMessage(msg)
}

parentPort?.on("message", (msg: WorkerRequest) => {
  void handle(msg)
})

async function handle(msg: WorkerRequest): Promise<void> {
  try {
    if (msg.type === "init") {
      const { tokens, blankId } = loadParakeetVocab(msg.modelDir)
      model = {
        graph: await createOnnxParakeetGraph(msg.modelDir, blankId),
        tokens,
        blankId
      }
      post({ type: "ready" })
      return
    }
    if (!model) throw new Error("Parakeet worker is not initialized")
    const segments = await captionParakeetWindow(msg.pcm, model, {
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
