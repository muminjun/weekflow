import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const base =
  process.env.VITE_BASE_PATH ||
  loadEnv("development", process.cwd(), "VITE_").VITE_BASE_PATH ||
  "/";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "weekflow-service-worker",
      generateBundle(_options, bundle) {
        const files = [
          "./",
          "index.html",
          "manifest.webmanifest",
          "privacy.html",
          "terms.html",
          "policy.css",
          "icon.svg",
          "icon-192.png",
          "icon-512.png",
          ...Object.keys(bundle),
        ];
        const hash = createHash("sha256")
          .update(JSON.stringify(files))
          .update(readFileSync("public/sw.js", "utf8"))
          .digest("hex")
          .slice(0, 12);
        const source = readFileSync("public/sw.js", "utf8")
          .replace("__CACHE_NAME__", "weekflow-shell-" + base + hash)
          .replace("__ASSETS__", JSON.stringify(files));
        this.emitFile({ type: "asset", fileName: "sw.js", source });
      },
    },
  ],
  base,
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
