import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests: need a local Supabase running. Run with `npm run test:db`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    // One file at a time: the tests share a database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
