import express from "express";
import cors from "cors";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mkdtemp, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  providers,
  cached,
  cache,
  streamRequest,
  status,
} from "./providers.js";

const audioDirectory = await mkdtemp(path.join(tmpdir(), "wavemusic-"));
cache.on("expired", (key, value) => {
  if (key.startsWith("audio:")) rm(value, { force: true }).catch(() => {});
});
function validate(req) {
  const { id, source } = req.query;
  if (
    !["yt", "sc"].includes(source) ||
    typeof id !== "string" ||
    !(source === "yt" ? /^[\w-]{11}$/.test(id) : /^\d{1,20}$/.test(id))
  ) {
    throw Object.assign(new Error("Укажите корректные id и source=yt|sc"), {
      status: 400,
    });
  }
  return { id, source };
}
async function hlsFile(id, source, url) {
  return cached(`audio:${source}:${id}`, async () => {
    const file = path.join(audioDirectory, `${source}-${id}.m4a`);
    const partial = `${file}.part.m4a`;
    await new Promise((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-loglevel",
          "error",
          "-tls_verify",
          "1",
          "-protocol_whitelist",
          "https,tls,tcp,crypto",
          "-i",
          url,
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          partial,
        ],
        { stdio: "ignore" },
      );
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 120000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve()
          : reject(
              new Error(
                "Не удалось подготовить HLS-аудио. Проверьте FFmpeg и доступ к источнику.",
              ),
            );
      });
    }).catch(async (error) => {
      await rm(partial, { force: true });
      throw error;
    });
    await rename(partial, file);
    return file;
  });
}
export function createApp(sources = providers, fetchAudio = streamRequest) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: "*",
      exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", sources: status }),
  );
  app.get("/api/search", async (req, res) => {
    const { q, source = "all" } = req.query;
    if (
      typeof q !== "string" ||
      !q.trim() ||
      q.length > 200 ||
      !["all", "yt", "sc"].includes(source)
    )
      return res
        .status(400)
        .json({ error: "Нужны q (1–200 символов) и source=all|yt|sc" });
    const selected = source === "all" ? ["yt", "sc"] : [source];
    const results = await Promise.allSettled(
      selected.map((s) =>
        cached(`search:${s}:${q.trim().toLowerCase()}`, () =>
          sources[s].search(q.trim()),
        ),
      ),
    );
    const tracks = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    const errors = results.flatMap((r, i) =>
      r.status === "rejected"
        ? [
            {
              source: selected[i],
              message: `${selected[i] === "yt" ? "YouTube Music" : "SoundCloud"} временно недоступен`,
            },
          ]
        : [],
    );
    res
      .status(errors.length === selected.length ? 503 : 200)
      .json({ tracks, errors });
  });
  app.get("/api/recommendations", async (req, res) => {
    const { id, source } = validate(req);
    const tracks = await cached(`recommendations:${source}:${id}`, () =>
      sources[source].recommendations(id),
    );
    res.json({ tracks });
  });
  app.get("/api/stream", async (req, res) => {
    const { id, source } = validate(req);
    if (req.headers.range && !/^bytes=\d*-\d*$/.test(req.headers.range))
      return res.status(416).end();
    const key = `stream:${source}:${id}`;
    let stream = await cached(key, () => sources[source].stream(id), 300);
    if (stream.protocol === "hls") {
      const file = await hlsFile(id, source, stream.url);
      return res.sendFile(file);
    }
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    const options = {
      headers: req.headers.range ? { Range: req.headers.range } : {},
      signal: controller.signal,
    };
    let upstream = await fetchAudio(stream.url, options);
    if ([401, 403].includes(upstream.status)) {
      await upstream.body?.cancel();
      cache.del(key);
      stream = await cached(key, () => sources[source].stream(id), 300);
      upstream = await fetchAudio(stream.url, options);
    }
    if (!upstream.ok && upstream.status !== 416) {
      await upstream.body?.cancel();
      throw new Error("Аудиопоток источника недоступен");
    }
    res.status(upstream.status);
    for (const header of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader("Cache-Control", "private, no-store");
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res).catch((error) => {
      if (!controller.signal.aborted) throw error;
    });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Маршрут не найден" }),
  );
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.destroy();
    res
      .status(error.status || 502)
      .json({
        error:
          error.status === 400
            ? error.message
            : "Источник недоступен. Попробуйте другой трек или повторите позже.",
      });
  });
  return app;
}
