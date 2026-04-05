import { defineConfig, type Plugin } from "vite";
import { transformWithEsbuild } from "vite";
import fs from "fs";
import path from "path";
import dts from "vite-plugin-dts";

function inlineWorkerPlugin(): Plugin {
  const WORKER_SUFFIX = "?worker-inline";
  const WORKLET_SUFFIX = "?worklet-inline";

  function matchSuffix(s: string): string | undefined {
    if (s.endsWith(WORKER_SUFFIX)) return WORKER_SUFFIX;
    if (s.endsWith(WORKLET_SUFFIX)) return WORKLET_SUFFIX;
  }

  return {
    name: "inline-worker-string",
    enforce: "pre",
    resolveId(source, importer) {
      const suffix = matchSuffix(source);
      if (!suffix) return;
      const bare = source.slice(0, -suffix.length);
      const resolved = path.resolve(path.dirname(importer!), bare);
      return resolved + suffix;
    },
    async load(id) {
      const suffix = matchSuffix(id);
      if (!suffix) return;
      const filePath = id.slice(0, -suffix.length);
      const source = fs.readFileSync(filePath, "utf-8");

      if (suffix === WORKER_SUFFIX) {
        const { code } = await transformWithEsbuild(source, filePath, {
          minify: true,
          format: "iife",
          target: "es2020",
        });
        return `export default ${JSON.stringify(code)};`;
      }

      // Worklet: ESM format, returned as a base64 data URL
      const { code } = await transformWithEsbuild(source, filePath, {
        minify: true,
        format: "esm",
        target: "es2020",
      });
      const base64 = Buffer.from(code).toString("base64");
      const dataUrl = `data:application/javascript;base64,${base64}`;
      return `export default ${JSON.stringify(dataUrl)};`;
    },
  };
}

export default defineConfig({
  plugins: [
    inlineWorkerPlugin(),
    dts({
      outDir: path.resolve(__dirname, "dist"),
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
