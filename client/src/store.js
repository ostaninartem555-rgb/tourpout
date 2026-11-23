import { useProfiles } from "./profiles";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { get, set, del, entries } from "idb-keyval";
import { api, streamUrl, trackKey } from "./api";

export const audio = new Audio();
audio.preload = "metadata";
let playVersion = 0;
let failedVersion = -1;
const failedTracks = new Set();
let objectUrl;
let replenishJob;
let listened = 0;
let lastPosition = 0;
let rewarded = false;
let bufferingTimer;
function clearBufferingTimeout() {
  clearTimeout(bufferingTimer);
  bufferingTimer = undefined;
}
function startBufferingTimeout() {
  if (bufferingTimer !== undefined) return;
  bufferingTimer = setTimeout(() => {
    clearBufferingTimeout();
    audio.pause();
    const store = usePlayer.getState();
    store.message(
      "Сервер слишком долго отдаёт аудио. Нажмите Play, чтобы повторить.",
    );
  }, 25000);
}
const moodQueries = {
  Всё: "indie electronic music",
  Бодрое: "energetic dance music",
  Чилл: "chill lofi music",
  Ночь: "night ambient music",
};
const terms = (track) => [
  `artist:${track.artist.toLowerCase()}`,
  ...(track.tags || []).map((t) => `tag:${t.toLowerCase()}`),
];
const unique = (tracks) => [
  ...new Map(tracks.map((t) => [trackKey(t), t])).values(),
];
const related = (a, b) => terms(a).some((term) => terms(b).includes(term));
export const usePlayer = create(
  persist(
    (setState, getState) => ({
      current: null,
      repeat: "off",
      shuffle: false,
      cycleRepeat() {
        setState({
          repeat: { off: "one", one: "all", all: "off" }[getState().repeat],
        });
      },
      toggleShuffle() {
        setState({ shuffle: !getState().shuffle });
      },
      playing: false,
      loading: false,
      position: 0,
      duration: 0,
      queue: [],
      back: [],
      likes: [],
      history: [],
      downloads: [],
      saving: [],
      weights: {},
      wave: false,
      mood: "Всё",
      error: "",
      message(error) {
        setState({ error });
      },
      setMood(mood) {
        setState({ mood });
      },
      async refreshDownloads() {
        try {
          setState({
            downloads: (await entries())
              .filter(([k]) => String(k).startsWith("track:"))
              .map(([, value]) => value.track),
          });
        } catch {
          setState({ error: "Браузер запретил доступ к офлайн-хранилищу" });
        }
      },
      async save(track) {
        const key = trackKey(track);
        if (getState().saving.includes(key)) return;
        setState({ saving: [...getState().saving, key], error: "" });
        try {
          const response = await fetch(streamUrl(track), {
            signal: AbortSignal.timeout(180000),
          });
          if (!response.ok) throw new Error("Не удалось скачать трек");
          const blob = await response.blob();
          if (
            !blob.size ||
            !/^(audio\/|video\/mp4|application\/octet-stream)/.test(blob.type)
          )
            throw new Error("Источник вернул некорректное аудио");
          await set(`track:${key}`, { track, blob });
          await getState().refreshDownloads();
        } catch (error) {
          setState({
            error: `${error.message}. Проверьте подключение и свободное место.`,
          });
        } finally {
          setState({ saving: getState().saving.filter((k) => k !== key) });
        }
      },
      async removeDownload(track) {
        try {
          await del(`track:${trackKey(track)}`);
          await getState().refreshDownloads();
        } catch {
          setState({ error: "Не удалось удалить скачанный трек" });
        }
      },
      feedback(track, amount) {
        const weights = { ...getState().weights };
        for (const term of terms(track))
          weights[term] = Math.max(
            -10,
            Math.min(20, (weights[term] || 0) + amount),
          );
        setState({ weights });
      },
      like(track) {
        const exists = getState().likes.some(
          (t) => trackKey(t) === trackKey(track),
        );
        setState({
          likes: exists
            ? getState().likes.filter((t) => trackKey(t) !== trackKey(track))
            : [track, ...getState().likes],
        });
        getState().feedback(track, exists ? -2 : 2);
      },
      rank(tracks) {
        const weights = getState().weights;
        const score = (t) =>
          terms(t).reduce((total, term) => total + (weights[term] || 0), 0);
        return unique(tracks).sort((a, b) => score(b) - score(a));
      },
      async play(track, queue, wave) {
        const version = ++playVersion;
        if (wave !== undefined) {
          failedTracks.clear();
          setState({ back: [] });
        }
        audio.pause();
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        listened = 0;
        lastPosition = 0;
        rewarded = false;
        setState({
          current: track,
          loading: true,
          playing: false,
          position: 0,
          duration: track.duration,
          error: "",
          ...(queue ? { queue } : {}),
          ...(wave !== undefined ? { wave } : {}),
        });
        try {
          let saved;
          try {
            saved = await get(`track:${trackKey(track)}`);
          } catch {
            /* Online playback remains available. */
          }
          if (version !== playVersion) return;
          if (saved) objectUrl = URL.createObjectURL(saved.blob);
          audio.src = objectUrl || streamUrl(track);
          audio.load();
          startBufferingTimeout();
          await audio.play();
          if (version !== playVersion) return;
          setState({
            history: unique([track, ...getState().history]).slice(0, 200),
          });
          if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: track.title,
              artist: track.artist,
              album: "W music",
              artwork: track.coverUrl ? [{ src: track.coverUrl }] : [],
            });
          }
          if (getState().wave && getState().queue.length < 5)
            void getState().replenish(track);
        } catch (error) {
          if (version === playVersion && !getState().error)
            setState({
              loading: false,
              playing: false,
              error:
                error.name === "NotAllowedError"
                  ? "Нажмите Play, чтобы начать воспроизведение"
                  : "Не удалось воспроизвести трек. Выберите другой источник или трек.",
            });
        }
      },
      async toggle() {
        if (!getState().current) return getState().startWave();
        if (audio.error) {
          failedTracks.delete(trackKey(getState().current));
          return getState().play(getState().current);
        }
        if (!audio.paused) return audio.pause();
        try {
          await audio.play();
        } catch {
          setState({ error: "Аудиопоток недоступен" });
        }
      },
      seek(position) {
        if (!Number.isFinite(audio.duration)) return;
        audio.currentTime = Math.max(0, Math.min(position, audio.duration));
        lastPosition = audio.currentTime;
        setState({ position: audio.currentTime });
      },
      async replenish(seed, rejected) {
        if (replenishJob) await replenishJob;
        const version = playVersion;
        const job = (async () => {
          try {
            let { tracks } = await api("recommendations", {
              id: seed.id,
              source: seed.source,
            });
            if (version !== playVersion || !getState().wave) return;
            const seen = new Set(
              [getState().current, ...getState().history.slice(0, 30)]
                .filter(Boolean)
                .map(trackKey),
            );
            let candidates = tracks.filter(
              (t) =>
                !seen.has(trackKey(t)) && (!rejected || !related(t, rejected)),
            );
            if (candidates.length < 5) {
              const more = await api("search", {
                q: moodQueries[getState().mood],
                source: "all",
              });
              if (version !== playVersion || !getState().wave) return;
              candidates = [
                ...candidates,
                ...more.tracks.filter(
                  (t) =>
                    !seen.has(trackKey(t)) &&
                    (!rejected || !related(t, rejected)),
                ),
              ];
            }
            setState({
              queue: getState().rank([...getState().queue, ...candidates]),
            });
          } catch {
            if (version === playVersion)
              setState({
                error:
                  "Рекомендации недоступны. Уже загруженная очередь продолжит играть.",
              });
          }
        })();
        replenishJob = job;
        await job;
        if (replenishJob === job) replenishJob = null;
      },
      async next(manual = true, failed = false) {
        const { current, wave } = getState();
        if (!current) return;
        if (!manual && !failed && getState().repeat === "one") {
          getState().seek(0);
          await audio
            .play()
            .catch(() => getState().message("Не удалось повторить трек."));
          return;
        }
        const version = playVersion;
        const early = manual && audio.currentTime < 10;
        audio.pause();
        if (early && wave) {
          getState().feedback(current, -2);
          setState({
            queue: getState().queue.filter((t) => !related(t, current)),
          });
        }
        if (wave && !failed && (early || !getState().queue.length))
          await getState().replenish(current, early ? current : null);
        if (version !== playVersion) return;
        const state = getState();
        const playable = (track) => !failedTracks.has(trackKey(track));
        let queue = state.queue.filter(playable);
        let back = [...state.back, current];
        if (!queue.length && state.repeat === "all") {
          queue = unique(back).filter(playable);
          back = [];
        }
        const alternatives = queue.filter(
          (track) => trackKey(track) !== trackKey(current),
        );
        const choices = alternatives.length ? alternatives : queue;
        const next = state.shuffle
          ? choices[Math.floor(Math.random() * choices.length)]
          : queue[0];
        if (!next) {
          setState({
            loading: false,
            playing: false,
            error: failed
              ? "Не удалось загрузить аудио. Проверьте сервер или попробуйте другой трек."
              : "Очередь закончилась. Запустите новую волну или выберите трек.",
          });
          return;
        }
        setState({ back });
        await state.play(
          next,
          queue.filter((track) => trackKey(track) !== trackKey(next)),
        );
      },
      previous() {
        if (audio.currentTime > 3) return getState().seek(0);
        const back = [...getState().back];
        const previous = back.pop();
        if (previous) {
          setState({ back });
          void getState().play(previous, [
            getState().current,
            ...getState().queue,
          ]);
        }
      },
      async startWave() {
        const version = ++playVersion;
        setState({ loading: true, error: "" });
        try {
          const { tracks, errors } = await api("search", {
            q: moodQueries[getState().mood],
            source: "all",
          });
          if (version !== playVersion) return;
          const [first, ...queue] = getState().rank(tracks);
          if (!first) throw new Error("Для этого настроения пока нет треков");
          setState({ back: [] });
          await getState().play(first, queue, true);
          if (errors?.length)
            setState({ error: errors.map((e) => e.message).join(". ") });
        } catch (error) {
          if (version === playVersion)
            setState({ loading: false, error: error.message });
        }
      },
    }),
    {
      name: "wavemusic-library",
      version: 1,
      partialize: (s) => ({
        likes: s.likes,
        history: s.history,
        weights: s.weights,
        mood: s.mood,
      }),
    },
  ),
);

audio.addEventListener("play", () => {
  usePlayer.setState({ playing: true });
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = "playing";
});
audio.addEventListener("pause", () => {
  clearBufferingTimeout();
  usePlayer.setState({ playing: false, loading: false });
  if ("mediaSession" in navigator)
    navigator.mediaSession.playbackState = "paused";
});
audio.addEventListener("waiting", () => {
  if (audio.paused) return;
  startBufferingTimeout();
  usePlayer.setState({ loading: true });
});
audio.addEventListener("playing", () => {
  clearBufferingTimeout();
  usePlayer.setState({ loading: false, playing: true, error: "" });
});
audio.addEventListener("loadedmetadata", () =>
  usePlayer.setState({
    duration: Number.isFinite(audio.duration)
      ? audio.duration
      : usePlayer.getState().current?.duration || 0,
  }),
);
audio.addEventListener("timeupdate", () => {
  const delta = audio.currentTime - lastPosition;
  if (!audio.seeking && !audio.paused && delta > 0 && delta < 2) {
    listened += delta;
    const { activeId, listen } = useProfiles.getState();
    const { current } = usePlayer.getState();
    if (activeId && current) listen(activeId, current, delta);
  }
  lastPosition = audio.currentTime;
  usePlayer.setState({ position: audio.currentTime });
  if (
    "mediaSession" in navigator &&
    navigator.mediaSession.setPositionState &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, audio.duration),
    });
  }
  if (!rewarded && audio.duration > 0 && listened / audio.duration > 0.8) {
    rewarded = true;
    usePlayer.getState().feedback(usePlayer.getState().current, 1);
  }
});
audio.addEventListener("ended", () => void usePlayer.getState().next(false));
audio.addEventListener("error", () => {
  clearBufferingTimeout();
  const state = usePlayer.getState();
  if (!state.current || failedVersion === playVersion) return;
  failedVersion = playVersion;
  failedTracks.add(trackKey(state.current));
  usePlayer.setState({ loading: false, playing: false });
  void state.next(false, true);
});
if ("mediaSession" in navigator) {
  const handlers = {
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    nexttrack: () => usePlayer.getState().next(),
    previoustrack: () => usePlayer.getState().previous(),
    seekto: (e) => usePlayer.getState().seek(e.seekTime),
    seekbackward: (e) =>
      usePlayer.getState().seek(audio.currentTime - (e.seekOffset || 10)),
    seekforward: (e) =>
      usePlayer.getState().seek(audio.currentTime + (e.seekOffset || 10)),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* Some WebViews support only playback actions. */
    }
  }
}
