import fs from "fs/promises";
import { transform } from "esbuild";

export function audioWorkletInlinePlugin() {
  return {
    name: "audio-worklet-inline",
    enforce: "pre" as const,
    async resolveId(source, importer) {
      if (source.endsWith(".worklet.ts?inline")) {
        const withoutQuery = source.replace("?inline", "");
        const resolved = await this.resolve(withoutQuery, importer, {
          skipSelf: true,
        });
        if (resolved) return resolved.id + "?inline";
      }
      return null;
    },
    async load(id) {
      if (id.endsWith(".worklet.ts?inline")) {
        const filePath = id.replace(/\?inline$/, "");
        const code = await fs.readFile(filePath, "utf-8");
        const result = await transform(code, {
          loader: "ts",
          target: "es2018",
        });
        const js = result.code;
        const base64 = Buffer.from(js).toString("base64");
        return `export default "data:application/javascript;base64,${base64}"`;
      }
      return null;
    },
  };
}
