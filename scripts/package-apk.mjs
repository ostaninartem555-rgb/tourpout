import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error("Set ANDROID_HOME to your Android SDK directory");
const tools = path.join(sdk, "build-tools", "35.0.0");
const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${path.basename(command)} failed (${result.status})`);
};
let keystore = process.env.WAVEMUSIC_KEYSTORE;
let password = process.env.WAVEMUSIC_KEY_PASSWORD;
let alias = process.env.WAVEMUSIC_KEY_ALIAS || "wavemusic";
if (!keystore) {
  const directory =
    process.env.WAVEMUSIC_SIGNING_DIR ||
    path.resolve(root, "..", ".wavemusic-signing");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  keystore = path.join(directory, "development.p12");
  const passwordFile = path.join(directory, "password");
  alias = "wavemusic-development";
  if (!existsSync(passwordFile)) {
    if (existsSync(keystore))
      throw new Error("Existing signing key has no password file");
    writeFileSync(passwordFile, randomBytes(32).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  }
  password = readFileSync(passwordFile, "utf8").trim();
  if (!existsSync(keystore)) {
    const keytool = process.env.JAVA_HOME
      ? path.join(process.env.JAVA_HOME, "bin", "keytool")
      : "keytool";
    run(
      keytool,
      [
        "-genkeypair",
        "-noprompt",
        "-keystore",
        keystore,
        "-storetype",
        "PKCS12",
        "-alias",
        alias,
        "-keyalg",
        "RSA",
        "-keysize",
        "3072",
        "-validity",
        "3650",
        "-dname",
        "CN=WaveMusic Development",
        "-storepass:env",
        "WAVEMUSIC_KEY_PASSWORD",
        "-keypass:env",
        "WAVEMUSIC_KEY_PASSWORD",
      ],
      { ...process.env, WAVEMUSIC_KEY_PASSWORD: password },
    );
  }
  console.log(
    "Signing with the local development key. Retain the signing directory for compatible updates.",
  );
}
if (!password)
  throw new Error(
    "WAVEMUSIC_KEY_PASSWORD is required for the provided keystore",
  );
const input = path.join(
  root,
  "client/android/app/build/outputs/apk/release/app-release-unsigned.apk",
);
const aligned = path.join(
  root,
  "client/android/app/build/outputs/apk/release/app-release-aligned.apk",
);
const output = path.join(root, "client/public/downloads/app-release.apk");
run(path.join(tools, "zipalign"), ["-f", "-p", "4", input, aligned]);
run(
  path.join(tools, "apksigner"),
  [
    "sign",
    "--ks",
    keystore,
    "--ks-key-alias",
    alias,
    "--ks-pass",
    "env:WAVEMUSIC_KEY_PASSWORD",
    "--key-pass",
    "env:WAVEMUSIC_KEY_PASSWORD",
    "--out",
    output,
    aligned,
  ],
  { ...process.env, WAVEMUSIC_KEY_PASSWORD: password },
);
run(path.join(tools, "apksigner"), ["verify", "--verbose", output]);
console.log("APK saved to client/public/downloads/app-release.apk");
