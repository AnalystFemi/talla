import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev: /api is proxied to the local Worker. Production: set VITE_API_URL to the Worker origin
// at build time (see src/api.js); the proxy is not used.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: { proxy: { "/api": env.DEV_API_PROXY || "http://localhost:8787" } },
  };
});
