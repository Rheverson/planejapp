import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // O domínio financeiro roda em Node puro (rápido);
    // só os testes de componente sobem o jsdom.
    environment: "node",
    environmentMatchGlobs: [["**/*.dom.test.jsx", "jsdom"]],
    setupFiles: ["./src/test/setup-jsdom.js"],
  },
});
