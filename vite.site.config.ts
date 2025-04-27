import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  base: "./",
  publicDir: "public",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src", "index.html"),
        sequencer: path.resolve(__dirname, "src", "sequencer.html"),
      },
    },
  },
});
