import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4400,
    proxy: {
      "/graph.json": {
        target: "http://localhost:4422",
        changeOrigin: true,
      },
    },
  },
});
