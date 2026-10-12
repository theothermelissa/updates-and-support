import { defineConfig } from "vitest/config";

// Two test projects:
// - unit: fast tests of pure logic, colocated with the code as `*.test.ts`.
// - integration: tests against a real Postgres (TEST_DATABASE_URL), in `tests/integration/`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Integration tests share one database, so run them one file at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
