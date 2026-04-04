import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: Number(process.env.VITE_PORT ?? 4400),
    proxy: {
      "/graph.json": {
        target: `http://localhost:${process.env.GO_PORT ?? 4422}`,
        changeOrigin: true,
      },
      "/analysis.json": {
        target: `http://localhost:${process.env.GO_PORT ?? 4422}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "happy-dom",
  },
});
