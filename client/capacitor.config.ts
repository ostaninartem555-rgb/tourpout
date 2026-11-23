import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.wavemusic.app",
  appName: "W music",
  webDir: "dist",
  server: { cleartext: true, androidScheme: "https" },
  android: { allowMixedContent: true },
};
export default config;
