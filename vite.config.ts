import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/.codegraph/**", "**/src-tauri/target/**", "**/dist/**", "**/artifacts/**"]
    }
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/lucide-svelte")) return "icons";
          if (id.includes("node_modules/@tauri-apps/plugin-dialog")) return "dialog";
          if (id.includes("node_modules/@tauri-apps")) return "tauri";
          if (id.includes("node_modules/svelte")) return "svelte";
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1
      }
    }
  }
});
