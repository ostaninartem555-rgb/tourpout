const strings = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() ||
  "";
const listKeys = ["tracks", "results", "items", "data"];

export function mediaUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeTracks(payload, source, base) {
  const tracks = Array.isArray(payload)
    ? payload
    : (listKeys.map((key) => payload?.[key]).find(Array.isArray) ??
      listKeys.map((key) => payload?.data?.[key]).find(Array.isArray) ??
      []);
  const seen = new Set();
  return tracks.flatMap((track) => {
    if (!track || typeof track !== "object") return [];
    const rawId = track.id ?? track.videoId;
    const id =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? String(rawId)
        : strings(rawId, track.videoId);
    const title = strings(track.title);
    const provider = ["yt", "sc"].includes(track.source)
      ? track.source
      : source === "sc" || (!track.videoId && /^\d+$/.test(id))
        ? "sc"
        : "yt";
    const key = provider + ":" + id;
    if (!id || !title || seen.has(key)) return [];
    seen.add(key);
    const duration =
      typeof track.duration === "string" &&
      /^\d+(?::\d{1,2}){1,2}$/.test(track.duration)
        ? track.duration
            .split(":")
            .reduce((seconds, part) => seconds * 60 + Number(part), 0)
        : Number(track.duration);
    return [
      {
        id,
        title,
        source: provider,
        artist:
          strings(track.artist, track.artist?.name) ||
          "Неизвестный исполнитель",
        trackStats: track.trackStats,
        artistStats: track.artistStats,
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        coverUrl: mediaUrl(
          strings(track.coverUrl, track.thumbnail, track.thumbnail?.url),
          base,
        ),
        streamUrl: mediaUrl(
          strings(track.streamUrl, track.audioUrl, track.url),
          base,
        ),
        waveform:
          Array.isArray(track.waveform) && track.waveform.some(Number.isFinite)
            ? track.waveform
                .slice(0, 120)
                .map((value) =>
                  Number.isFinite(value)
                    ? Math.min(1, Math.max(0.05, value))
                    : 0.2,
                )
            : Array(60).fill(0.2),
        tags: Array.isArray(track.tags)
          ? track.tags.filter((tag) => typeof tag === "string")
          : [],
      },
    ];
  });
}
