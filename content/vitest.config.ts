import { defineConfig } from "vitest/config";
// content/ tests only (the root config covers the Worker's src/ and test/)
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 120000 } });
