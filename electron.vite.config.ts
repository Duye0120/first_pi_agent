import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["diff"] })],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "embedding-worker": resolve("src/main/memory/embedding-worker.ts"),
        },
        output: {
          // 主入口与 worker 入口都按各自名字落到 out/main 下，便于 worker_threads
          // 用 `new URL("./embedding-worker.js", import.meta.url)` 解析。
          entryFileNames: "[name].js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      hmr: {
        host: "127.0.0.1",
        protocol: "ws",
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
  },
});
