import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Check if we're building web components
const isWebComponentsBuild = process.env.BUILD_TARGET === "web-components";

export default defineConfig({
  base: "./",
  plugins: isWebComponentsBuild ? [] : [react()],
  css: {
    postcss: path.resolve(__dirname, "postcss.config.js"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@schema": path.resolve(__dirname, "../src/schema"),
    },
  },
  build: isWebComponentsBuild
    ? {
        // Web components build - single bundle (don't clear main app build)
        outDir: "dist",
        emptyOutDir: false,
        sourcemap: true,
        lib: {
          entry: path.resolve(__dirname, "src/web-components/index.ts"),
          name: "WorkbenchComponents",
          fileName: () => "components.js",
          formats: ["iife"],
        },
        rollupOptions: {
          output: {
            // Inline all dependencies
            inlineDynamicImports: true,
          },
        },
      }
    : {
        // Main app build
        outDir: "dist",
        sourcemap: true,
      },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    headers: {
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  },
});
