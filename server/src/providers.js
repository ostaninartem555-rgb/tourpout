import { Innertube, UniversalCache, Utils } from "youtubei.js";
import SoundCloud from "soundcloud-scraper";
import NodeCache from "node-cache";
import { getQuickJS } from "quickjs-emscripten";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
export const cache = new NodeCache({
  stdTTL: 3600,
  useClones: false,
  maxKeys: 5000,
});
export const status = { yt: "starting", sc: "starting" };
const pending = new Map();
export async function cached(key, fn, ttl = 3600) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (pending.has(key)) return pending.get(key);
  const job = Promise.resolve()
    .then(fn)
    .then((value) => {
      if (cache.keys().length > 4900) cache.flushAll();
      cache.set(key, value, ttl);
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
export async function request(url, options = {}) {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
    : AbortSignal.timeout(20000);
  return fetch(url, { ...options, signal });
}
export async function streamRequest(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
async function json(url) {
  const response = await request(url);
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
  return response.json();
}
export function waveform(id) {
  let seed = 2166136261;
  for (const c of String(id))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: 60 }, () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return +(0.15 + ((seed >>> 0) / 4294967295) * 0.85).toFixed(3);
  });
}
Utils.Platform.shim.eval = async (data) => {
  const vm = (await getQuickJS()).newContext();
  const deadline = Date.now() + 2000;
  vm.runtime.setMemoryLimit(32 * 1024 * 1024);
  vm.runtime.setInterruptHandler(() => Date.now() > deadline);
  try {
    const result = vm.evalCode(`(function() { ${data.output} })()`);
    if (result.error) {
      result.error.dispose();
      throw new Error("Ошибка обработки аудиоссылки YouTube");
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    return value;
  } finally {
    vm.dispose();
  }
};
let yt;
const sc = new SoundCloud.Client(null, { fetchAPIKey: false });
async function youtube() {
  return cached("client:yt", async () => {
    try {
      yt = await Innertube.create({
        cache: new UniversalCache(false),
        fetch: request,
        lang: "en",
        location: "US",
      });
      status.yt = "ready";
      return yt;
    } catch {
      status.yt = "unavailable";
      throw new Error("YouTube Music недоступен");
    }
  });
}
const scHeaders = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};
export async function getSoundCloudClientId() {
  return cached("client:sc", async () => {
    const page = await request("https://soundcloud.com", {
      headers: scHeaders,
    });
    if (!page.ok) throw new Error("SoundCloud недоступен");
    const scripts = [
      ...(await page.text()).matchAll(
        /<script\b[^>]*\bsrc=["'](https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']+\.js(?:\?[^"']*)?)["']/gi,
      ),
    ];
    for (const [, url] of scripts.reverse()) {
      const response = await request(url, { headers: scHeaders }).catch(
        () => null,
      );
      if (!response?.ok) continue;
      const key = (await response.text()).match(
        /["']?client_id["']?\s*:\s*["']([a-zA-Z0-9]{32})["']/,
      )?.[1];
      if (key) {
        await sc.createAPIKey(key, false);
        status.sc = "ready";
        return key;
      }
    }
    throw new Error("Публичный client_id не найден");
  }).catch((error) => {
    status.sc = "unavailable";
    throw error;
  });
}
async function scApi(path, params = {}, valid = (value) => value != null) {
  const endpoint = new URL(path, "https://api-v2.soundcloud.com");
  if (endpoint.origin !== "https://api-v2.soundcloud.com")
    throw new Error("Некорректный адрес SoundCloud API");
  for (const [name, value] of Object.entries(params))
    endpoint.searchParams.set(name, value);
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = await getSoundCloudClientId();
    endpoint.searchParams.set("client_id", id);
    const response = await request(endpoint, { headers: scHeaders });
    if (!response.ok && ![401, 403].includes(response.status))
      throw new Error(`SoundCloud HTTP ${response.status}`);
    const data = response.ok ? await response.json().catch(() => null) : null;
    if (response.ok && valid(data)) return data;
    if (cache.get("client:sc") === id) cache.del("client:sc");
  }
  throw new Error("SoundCloud не вернул данные после обновления client_id");
}
function count(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(
    /^(\d+(?:[,\u00a0 ]\d{3})*|\d+(?:\.\d+)?[KMB])(?: views)?$/i,
  );
  if (!match) return null;
  const number = match[1].replace(/[,\s]/g, "");
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[number.at(-1).toUpperCase()];
  const result = scale ? Number(number.slice(0, -1)) * scale : Number(number);
  return Number.isFinite(result) ? Math.round(result) : null;
}
const artistStats = (name) => ({
  name,
  soundcloudPlays: null,
  soundcloudFollowers: null,
  youtubePlays: null,
  youtubeSubscribers: null,
});
async function enrichYouTube(client, track, item) {
  const info = await cached(`stats:yt:video:${track.id}`, () =>
    client.getBasicInfo(track.id),
  ).catch(() => null);
  track.trackStats.youtubePlays =
    count(info?.basic_info?.view_count) ?? track.trackStats.youtubePlays;
  track.artistStats = artistStats(track.artist);
  const channelId =
    item.artists?.[0]?.channel_id || info?.basic_info?.channel_id;
  if (!channelId) return track;
  const about = await cached(`stats:yt:artist:${channelId}`, async () => {
    const channel = await client.getChannel(channelId);
    const result = await channel.getAbout();
    return result.metadata || result;
  }).catch(() => null);
  track.artistStats.youtubePlays = count(about?.view_count);
  track.artistStats.youtubeSubscribers = about?.subscriber_count || null;
  return track;
}
async function ytTracks(client, items) {
  return Promise.all(
    items.filter(Boolean).map(async (item) => {
      const track = ytTrack(item);
      return track && enrichYouTube(client, track, item);
    }),
  ).then((tracks) => tracks.filter(Boolean));
}
async function scArtist(user) {
  const stats = artistStats(user?.username || "SoundCloud");
  stats.soundcloudFollowers = count(user?.followers_count);
  if (!user?.id) return stats;
  const data = await cached(`stats:sc:artist:${user.id}`, async () => {
    const [profile, top] = await Promise.allSettled([
      scApi(`/users/${user.id}`),
      scApi(`/users/${user.id}/toptracks`, { limit: "10" }),
    ]);
    const tracks = top.value?.collection ?? top.value;
    const plays = (Array.isArray(tracks) ? tracks : [])
      .map((track) => count(track?.playback_count))
      .filter((value) => value !== null);
    return {
      soundcloudFollowers: count(profile.value?.followers_count),
      soundcloudPlays: plays.length
        ? plays.reduce((total, value) => total + value, 0)
        : null,
    };
  });
  return {
    ...stats,
    ...data,
    soundcloudFollowers: data.soundcloudFollowers ?? stats.soundcloudFollowers,
  };
}
function ytTrack(item) {
  const id = item.id || item.video_id;
  if (!id || !item.title) return null;
  const thumbs = item.thumbnails || item.thumbnail || [];
  return {
    id,
    source: "yt",
    title: String(item.title),
    artist:
      item.artists?.map((a) => a.name).join(", ") ||
      item.author?.name ||
      String(item.author || "YouTube Music"),
    duration: item.duration?.seconds || 0,
    coverUrl: thumbs.at(-1)?.url || "",
    waveform: waveform(id),
    tags: [],
    trackStats: {
      soundcloudPlays: null,
      youtubePlays: count(item.views ?? item.viewCount),
    },
  };
}
function scTrack(item) {
  return {
    id: String(item.id),
    source: "sc",
    title: item.title,
    artist: item.user?.username || "SoundCloud",
    duration: Math.round(item.duration / 1000),
    coverUrl: (item.artwork_url || item.user?.avatar_url || "").replace(
      "-large.",
      "-t500x500.",
    ),
    waveform: waveform(item.id),
    tags: [item.genre, ...(item.tag_list?.match(/"[^"]+"|\S+/g) || [])]
      .filter(Boolean)
      .map((t) => t.replaceAll('"', "")),
    waveformUrl: item.waveform_url,
    trackStats: {
      soundcloudPlays: count(item.playback_count),
      youtubePlays: null,
    },
  };
}
async function scTracks(items) {
  return Promise.all(
    items.map(async (item) => {
      const track = scTrack(item);
      track.artistStats = await scArtist(item.user);
      if (!item.waveform_url) return track;
      try {
        const url = new URL(item.waveform_url);
        if (!url.hostname.endsWith(".sndcdn.com")) return track;
        url.protocol = "https:";
        const data = await cached(`waveform:sc:${item.id}`, () => json(url));
        if (data.samples?.length) {
          const peak = Math.max(1, ...data.samples);
          track.waveform = Array.from({ length: 60 }, (_, i) => {
            const slice = data.samples.slice(
              Math.floor((i * data.samples.length) / 60),
              Math.max(
                Math.floor(((i + 1) * data.samples.length) / 60),
                Math.floor((i * data.samples.length) / 60) + 1,
              ),
            );
            return Math.max(0.15, Math.max(...slice) / peak);
          });
        }
      } catch {
        /* Keep the deterministic fallback when waveform data is unavailable. */
      }
      return track;
    }),
  );
}
export const providers = {
  yt: {
    async search(query) {
      const client = await youtube();
      const result = await client.music.search(query, { type: "song" });
      return ytTracks(
        client,
        result?.songs?.contents ||
          result?.contents?.flatMap((s) => s?.contents || []) ||
          [],
      );
    },
    async recommendations(id) {
      const client = await youtube();
      const result = await client.music.getUpNext(id);
      return ytTracks(
        client,
        (result?.contents || [])
          .filter((item) => item?.video_id !== id)
          .slice(0, 20),
      );
    },
    async stream(id) {
      const client = await youtube();
      const info = await client.getBasicInfo(id);
      const format = info.chooseFormat({ type: "audio", quality: "best" });
      return {
        url: await format.decipher(client.session.player),
        mime: format.mime_type,
        protocol: "progressive",
      };
    },
  },
  sc: {
    async search(query) {
      const result = await scApi(
        "/search/tracks",
        { q: query, limit: "30" },
        (value) => Array.isArray(value?.collection),
      );
      return scTracks(
        result.collection.filter(
          (track) => track?.id && track.title && track.streamable !== false,
        ),
      );
    },
    async recommendations(id) {
      const result = await scApi(
        `/tracks/${id}/related`,
        { limit: "20" },
        (value) => Array.isArray(value?.collection),
      );
      return scTracks(
        result.collection
          .filter(
            (track) =>
              track?.id &&
              track.title &&
              track.streamable !== false &&
              String(track.id) !== id,
          )
          .slice(0, 20),
      );
    },
    async stream(id) {
      const track = await scApi(
        `/tracks/${id}`,
        {},
        (value) => value?.id != null,
      );
      const formats = Array.isArray(track.media?.transcodings)
        ? track.media.transcodings
        : [];
      const rank = (format) =>
        format.protocol === "progressive" &&
        format.mime_type?.includes("audio/mpeg")
          ? 0
          : format.protocol === "hls"
            ? 1
            : 2;
      const candidates = formats
        .filter(
          (item) =>
            !item?.snipped &&
            item?.url &&
            ["progressive", "hls"].includes(item.format?.protocol),
        )
        .sort((a, b) => rank(a.format) - rank(b.format));
      for (const candidate of candidates) {
        try {
          const params = track.track_authorization
            ? { track_authorization: track.track_authorization }
            : {};
          const result = await scApi(
            candidate.url,
            params,
            (value) =>
              typeof value?.url === "string" && /^https:\/\//.test(value.url),
          );
          return {
            url: result.url,
            protocol: candidate.format.protocol,
            mime: candidate.format.mime_type,
          };
        } catch {
          /* Try the next available format. */
        }
      }
      throw new Error("Полный аудиопоток недоступен");
    },
  },
};
export async function initialize() {
  await Promise.allSettled([youtube(), getSoundCloudClientId()]);
}
