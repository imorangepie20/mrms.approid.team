import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: "../web/public/admin",
    rollupOptions: {
      output: {
        assetFileNames: "assets/index[extname]",
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name].js",
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
