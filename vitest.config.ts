import { defineConfig } from "vitest/config";
import { url } from "node:inspector";

const exclude = ["dist/**/*", "vitest.config.ts"];
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude,
    reporters: ["tap-flat"],
    coverage: {
      enabled: !url(),
      thresholds: { 100: true },
      provider: "istanbul",
      exclude: ["src/__tests__/**/*", "src/examples/**/*", ...exclude],
    },
  },
});
