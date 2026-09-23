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
        assetFileNames: "assets/[name]-[hash][extname]",
        entryFileNames: "assets/index-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
