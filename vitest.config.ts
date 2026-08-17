import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Backend tests are included too — they used to be invisible to the runner,
    // so backend/validators/schemas.test.js sat there for months never executing.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "backend/**/*.{test,spec}.{js,mjs,ts}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
