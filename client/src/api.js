import { normalizeTracks } from "./normalize";
import { Capacitor } from "@capacitor/core";
import demoUrl from "./assets/wave-demo.mp3";

export const demoTrack = {
  id: "wave-demo",
  source: "demo",
  title: "Первая волна",
  artist: "WaveMusic",
  duration: 24,
};
export const DEFAULT_SERVER_URL =
  "https://barrel-default-signatures-ict.trycloudflare.com";
export const apiUrl = () =>
  (
    localStorage.getItem("wave-api-url") ||
    import.meta.env.VITE_API_URL ||
    DEFAULT_SERVER_URL
  ).replace(/\/$/, "");
export const streamUrl = (track) =>
  track.source === "demo"
    ? demoUrl
    : track.streamUrl ||
      `${apiUrl()}/api/stream?${new URLSearchParams({ id: track.id, source: track.source })}`;
export async function api(path, params, signal, base = apiUrl()) {
  if (
    !base ||
    (Capacitor.isNativePlatform() &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  )
    throw new Error(
      "Укажите доступный с телефона адрес сервера в разделе «Приложение».",
    );
  const response = await fetch(
    `${base}/api/${path}?${new URLSearchParams(params)}`,
    {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
    },
  ).catch((error) => {
    if (signal?.aborted) throw error;
    throw new Error(
      "Нет связи с музыкальным сервером. Проверьте адрес в разделе «Приложение» и подключение к сети.",
    );
  });
  const data = await response.json().catch(() => {
    throw new Error("По этому адресу не отвечает API WaveMusic.");
  });
  const errors = Array.isArray(data?.errors)
    ? data.errors.flatMap((error) => {
        const message = typeof error === "string" ? error : error?.message;
        return typeof message === "string" && message.trim()
          ? [{ message }]
          : [];
      })
    : [];
  if (!response.ok)
    throw new Error(
      data?.error ||
        errors.map((e) => e.message).join(". ") ||
        "Сервер недоступен",
    );
  if (path === "search" || path === "recommendations") {
    return {
      tracks: normalizeTracks(data, params?.source, base + "/"),
      errors,
    };
  }
  return data;
}
export const trackKey = (track) => `${track.source}:${track.id}`;
