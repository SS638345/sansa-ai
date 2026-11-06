import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// transformers.js loads the ONNX Runtime .wasm from its CDN at runtime, so the
// ~27 MB copy Vite would emit is never used. Dropping it keeps the Pages deploy small.
const dropOrtWasm = (): Plugin => ({
  name: "drop-ort-wasm",
  generateBundle(_opts, bundle) {
    for (const name of Object.keys(bundle)) {
      if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
    }
  },
});

export default defineConfig({
  // Relative base so the same build works at ss638345.github.io/sansa-ai/ and on a custom domain root.
  base: process.env.BASE_PATH || "./",
  plugins: [react(), dropOrtWasm()],
  worker: { format: "es", plugins: () => [dropOrtWasm()] },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
});
