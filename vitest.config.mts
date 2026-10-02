import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@app": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    root: projectRoot,
  },
});
