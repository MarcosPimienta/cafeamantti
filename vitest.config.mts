import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "scratch/**"],
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["utils/**", "app/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "app/**/page.tsx", "app/**/layout.tsx", "**/*.d.ts"],
    },
  },
});
