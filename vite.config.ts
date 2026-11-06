import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the same build works at ss638345.github.io/sansa-ai/ and on a custom domain root.
  base: process.env.BASE_PATH || "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
});
