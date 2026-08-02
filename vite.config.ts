import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    envPrefix: ["VITE_", "GEMINI_", "APP_"],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(
        env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || "",
      ),
      "process.env.APP_URL": JSON.stringify(env.APP_URL || ""),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
