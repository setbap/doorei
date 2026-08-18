import { resolve } from "node:path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          shenavaWorker: resolve("src/adapters/shenavaWorker.ts"),
          parakeetWorker: resolve("src/adapters/parakeetWorker.ts"),
          embeddingWorker: resolve("src/adapters/embeddingWorker.ts")
        },
        external: ["onnxruntime-node"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src")
      }
    },
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler", { panicThreshold: "none" }]]
        }
      }),
      tailwindcss()
    ]
  }
})
