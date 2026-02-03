import path from "node:path";
import { defineConfig } from "@playwright/test";

const runtimeDir = path.join(process.cwd(), ".tmp", "awb-e2e");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3847",
    headless: true,
  },
  webServer: {
    command: "node dist/index.js ui --port 3847",
    url: "http://127.0.0.1:3847",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      AWB_RUNTIME_DIR: runtimeDir,
    },
  },
});
