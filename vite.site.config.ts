import { defineConfig } from "vite";
import path from "path";
import { audioWorkletInlinePlugin } from "./audio-worklet-inline.vite.plugin";

export default defineConfig({
  plugins: [audioWorkletInlinePlugin()],
  root: path.resolve(__dirname, "src"),
  base: "./",
  publicDir: "public",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src", "index.html"),
        sequencer: path.resolve(__dirname, "src", "sequencer.html"),
      },
    },
  },
});
