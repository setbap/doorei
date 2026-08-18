import { parentPort } from "node:worker_threads"

parentPort?.on("message", (msg) => {
  if (msg.type === "init") {
    parentPort.postMessage({ type: "ready" })
    return
  }
  if (msg.type === "embed") {
    parentPort.postMessage({
      type: "vectors",
      id: msg.id,
      vectors: msg.texts.map(() => [1, 0])
    })
  }
})
