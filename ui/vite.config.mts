import { defineConfig } from "vite";

export default defineConfig({
  build: {
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/[name].js",
      },
    },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 4400),
    proxy: {
      "/graph.json": {
        target: `http://localhost:${process.env.GO_PORT ?? 4422}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "happy-dom",
  },
});
