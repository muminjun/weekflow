import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const base =
  process.env.VITE_BASE_PATH ||
  loadEnv("development", process.cwd(), "VITE_").VITE_BASE_PATH ||
  "/";
const supabaseOrigin = (() => {
  const url =
    process.env.VITE_SUPABASE_URL ||
    loadEnv("production", process.cwd(), "VITE_").VITE_SUPABASE_URL;
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();
// GitHub Pages cannot send headers, so the built page carries its own policy.
// Dev keeps Vite's inline HMR preamble working by skipping it.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, "wss")}`.trim(),
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
export default defineConfig({
  plugins: [
    react(),
    {
      name: "weekflow-security-meta",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: contentSecurityPolicy,
          },
          injectTo: "head-prepend",
        },
        {
          tag: "meta",
          attrs: {
            name: "referrer",
            content: "strict-origin-when-cross-origin",
          },
          injectTo: "head-prepend",
        },
      ],
    },
    {
      name: "weekflow-service-worker",
      generateBundle(_options, bundle) {
        const files = [
          "./",
          "index.html",
          "manifest.webmanifest",
          "appearance.js",
          "privacy.html",
          "terms.html",
          "policy.css",
          "icon.svg",
          "icon-192.png",
          "icon-512.png",
          ...Object.keys(bundle),
        ];
        // Every cached public file feeds the version, so editing only the
        // policy pages, manifest or icons still ships a new service worker.
        const hasher = createHash("sha256")
          .update(JSON.stringify(files))
          .update(readFileSync("public/sw.js", "utf8"));
        for (const file of files)
          if (!(file in bundle) && file !== "./" && file !== "index.html")
            hasher.update(readFileSync(`public/${file}`));
        const hash = hasher.digest("hex").slice(0, 12);
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
