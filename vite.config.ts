import { defineConfig } from "vite";
import path from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      outDir: path.resolve(__dirname, "dist/types"),
      insertTypesEntry: true,
    }),
  ],
  // during `npm run dev` serve from src/
  root: path.resolve(__dirname, "src"),
  // make all asset imports relative to index.html
  base: "./",
  // assetsInclude: ["**/*.worklet.ts"],
  build: {
    lib: {
      entry: {
        deadon: path.resolve(__dirname, "src/deadon.ts"),
        sequencer: path.resolve(__dirname, "src/sequencer.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        entryName + (format === "cjs" ? ".cjs.js" : ".js"),
    },
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    minify: "terser",
  },
});
