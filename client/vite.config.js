import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: process.env.WAVEMUSIC_NATIVE_BUILD ? false : "public",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
