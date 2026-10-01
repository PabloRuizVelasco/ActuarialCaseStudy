import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Export only the React client. Python serves this bundle and the existing
// rating model, so a JavaScript server or Cloudflare runtime is unnecessary.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: { outDir: "dist/client", emptyOutDir: true },
});
