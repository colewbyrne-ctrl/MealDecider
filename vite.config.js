import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vitest transforms JSX with esbuild and defaults to the classic runtime, so
  // opt into the automatic runtime there. Vite 8's dev/build use oxc (which the
  // React plugin already configures), so this is scoped to test runs to avoid an
  // "esbuild options ignored" warning.
  ...(process.env.VITEST ? { esbuild: { jsx: "automatic" } } : {}),
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
