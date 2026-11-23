import { spawnSync } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const args of [
  ["run", "build", "-w", "client"],
  ["run", "android:sync", "-w", "client"],
]) {
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    env: { ...process.env, WAVEMUSIC_NATIVE_BUILD: "1" },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
