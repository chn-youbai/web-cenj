import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
