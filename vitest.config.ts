import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "packages/ink-runner/components/**/*.test.ts",
    ],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts", "packages/ink-runner/components/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/templates/**",
        "packages/ink-runner/components/**/*.test.ts",
      ],
      // Coverage thresholds for src/ modules
      // Note: src/commands/* are tested via CLI smoke tests, not unit tests
      // The core utility modules (events.ts, runtime.ts, etc.) have high coverage
      // Ink components (shared hooks, dashboard) are harder to unit test
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 45,
        lines: 30,
      },
    },
  },
});
