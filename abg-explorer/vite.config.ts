import vinext from "vinext";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [vinext()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8011", changeOrigin: true } } },
});
