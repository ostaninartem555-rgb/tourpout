import { artistSummary, formatCount } from "./play-stats";
import Profile from "./Profile";
import { demoTrack, DEFAULT_SERVER_URL } from "./api";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  AudioLines,
  Home,
  Search,
  Library,
  Smartphone,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Download,
  X,
  ChevronDown,
  ArrowUpRight,
  Volume2,
  LoaderCircle,
  Trash2,
  Radio,
  WifiOff,
  Check,
  Disc3,
} from "lucide-react";
import { api, apiUrl, trackKey } from "./api";
import { audio, usePlayer } from "./store";
const native = Capacitor.isNativePlatform();
const navigation = [
  { id: "home", title: "Главная", icon: Home },
  { id: "search", title: "Поиск", icon: Search },
  { id: "library", title: "Медиатека", icon: Library },
  { id: "app", title: "Приложение", icon: Smartphone },
];
const time = (seconds) =>
  `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, "0")}`;
function Cover({ track, className = "" }) {
  return (
    <div className={`cover ${className}`}>
      {track?.coverUrl && (
        <img
          src={track.coverUrl}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <Disc3 aria-hidden="true" />
    </div>
  );
}
function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function TrackList({
  tracks: items,
  empty = "Здесь появится ваша музыка",
  downloaded = false,
}) {
  const s = usePlayer();
  const tracks = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!tracks.length)
    return (
      <div className="empty">
        <AudioLines size={32} />
        <p>{empty}</p>
      </div>
    );
  return (
    <div className="track-list">
      {tracks.map((track, index) => {
        const key = trackKey(track);
        const active = s.current && trackKey(s.current) === key;
        const liked = s.likes.some((t) => trackKey(t) === key);
        const saved = s.downloads.some((t) => trackKey(t) === key);
        return (
          <div className={`track ${active ? "active" : ""}`} key={key}>
            <button
              className="track-main"
              onClick={() =>
                active
                  ? s.toggle()
                  : s.play(track, tracks.slice(index + 1), false)
              }
              aria-label={`Слушать ${track.title}`}
            >
              <Cover track={track} />
              <span className="track-description">
                <strong>{track.title}</strong>
                <small>{track.artist}</small>
                {track.source !== "demo" && (
                  <>
                    <small className="track-stats">
                      <span>
                        ☁ SoundCloud:{" "}
                        {formatCount(track.trackStats?.soundcloudPlays)}
                      </span>
                      <span>
                        ▶ YouTube Music:{" "}
                        {formatCount(track.trackStats?.youtubePlays)}
                      </span>
                    </small>
                    <small>{artistSummary(track.artistStats)}</small>
                  </>
                )}
              </span>
            </button>
            <span className="source">
              {track.source === "yt" ? "YouTube Music" : "SoundCloud"}
            </span>
            <span className="track-duration">{time(track.duration)}</span>
            <IconButton
              label={liked ? "Убрать лайк" : "Нравится"}
              aria-pressed={liked}
              onClick={() => s.like(track)}
            >
              <Heart size={18} fill={liked ? "currentColor" : "none"} />
            </IconButton>
            <IconButton
              label={
                downloaded
                  ? "Удалить загрузку"
                  : saved
                    ? "Сохранено офлайн"
                    : "Скачать трек"
              }
              disabled={s.saving.includes(key) || (saved && !downloaded)}
              onClick={() =>
                downloaded ? s.removeDownload(track) : s.save(track)
              }
            >
              {s.saving.includes(key) ? (
                <LoaderCircle className="spin" size={18} />
              ) : downloaded ? (
                <Trash2 size={18} />
              ) : saved ? (
                <Check size={18} />
              ) : (
                <Download size={18} />
              )}
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
function Waveform() {
  const { current, position, duration, seek } = usePlayer();
  const progress = duration ? position / duration : 0;
  return (
    <div
      className="waveform"
      role="slider"
      aria-label="Позиция воспроизведения"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={time(position)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          seek(
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? duration
                : position + (e.key === "ArrowRight" ? 5 : -5),
          );
        }
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        seek(((e.clientX - rect.left) / rect.width) * duration);
      }}
    >
      {(Array.isArray(current?.waveform) && current.waveform.length
        ? current.waveform
        : Array(60).fill(0.2)
      ).map((height, i) => (
        <span
          key={i}
          className={i / 60 <= progress ? "heard" : ""}
          style={{ height: `${height * 100}%` }}
        />
      ))}
    </div>
  );
}
function Controls() {
  const s = usePlayer();
  return (
    <div className="controls">
      <IconButton label="Предыдущий трек" onClick={s.previous}>
        <SkipBack size={22} fill="currentColor" />
      </IconButton>
      <button
        className="play-button"
        aria-label={s.playing ? "Пауза" : "Воспроизвести"}
        onClick={s.toggle}
      >
        {s.loading ? (
          <LoaderCircle className="spin" />
        ) : s.playing ? (
          <Pause fill="currentColor" />
        ) : (
          <Play fill="currentColor" />
        )}
      </button>
      <IconButton label="Следующий трек" onClick={() => s.next()}>
        <SkipForward size={22} fill="currentColor" />
      </IconButton>
    </div>
  );
}
function Player({ full, setFull }) {
  const s = usePlayer();
  if (!s.current) return null;
  const liked = s.likes.some((t) => trackKey(t) === trackKey(s.current));
  return (
    <>
      <section className="mini-player" aria-label="Плеер">
        <button
          className="now-playing"
          onClick={() => setFull(true)}
          aria-label="Открыть плеер"
        >
          <Cover track={s.current} />
          <span>
            <strong>{s.current.title}</strong>
            <small>{s.current.artist}</small>
          </span>
        </button>
        <div className="mini-center">
          <Controls />
          <div className="mini-progress">
            <span>{time(s.position)}</span>
            <input
              aria-label="Перемотка"
              type="range"
              min="0"
              max={s.duration || 1}
              value={s.position}
              onChange={(e) => s.seek(Number(e.target.value))}
            />
            <span>{time(s.duration)}</span>
          </div>
        </div>
        <div className="mini-actions">
          <IconButton
            label="Нравится"
            aria-pressed={liked}
            onClick={() => s.like(s.current)}
          >
            <Heart fill={liked ? "currentColor" : "none"} />
          </IconButton>
          <Volume2 size={20} />
          <input
            aria-label="Громкость"
            type="range"
            min="0"
            max="1"
            step="0.01"
            defaultValue="1"
            onChange={(e) => {
              audio.volume = Number(e.target.value);
            }}
          />
          <IconButton label="Открыть плеер" onClick={() => setFull(true)}>
            <ArrowUpRight />
          </IconButton>
        </div>
      </section>
      {full && (
        <div
          className="full-player"
          role="dialog"
          aria-modal="true"
          aria-label="Сейчас играет"
          onKeyDown={(e) => {
            if (e.key === "Escape") setFull(false);
          }}
        >
          <div
            className="player-blur"
            style={{
              backgroundImage: s.current.coverUrl
                ? `url(${JSON.stringify(s.current.coverUrl)})`
                : undefined,
            }}
          />
          <div className="full-inner">
            <header>
              <IconButton
                label="Свернуть плеер"
                autoFocus
                onClick={() => setFull(false)}
              >
                <ChevronDown />
              </IconButton>
              <span>{s.wave ? "МОЯ ВОЛНА" : "СЕЙЧАС ИГРАЕТ"}</span>
              <IconButton
                label="Скачать трек"
                disabled={s.saving.includes(trackKey(s.current))}
                onClick={() => s.save(s.current)}
              >
                <Download />
              </IconButton>
            </header>
            <Cover track={s.current} className="large-cover" />
            <div className="full-title">
              <div>
                <h2>{s.current.title}</h2>
                <p>{s.current.artist}</p>
                {s.current.source !== "demo" && (
                  <small>{artistSummary(s.current.artistStats)}</small>
                )}
              </div>
              <IconButton
                label="Нравится"
                aria-pressed={liked}
                onClick={() => s.like(s.current)}
              >
                <Heart fill={liked ? "currentColor" : "none"} />
              </IconButton>
            </div>
            <Waveform />
            <div className="time-labels">
              <span>{time(s.position)}</span>
              <span>{time(s.duration)}</span>
            </div>
            <div className="tabs" aria-label="Режим очереди">
              <button aria-pressed={s.shuffle} onClick={s.toggleShuffle}>
                Случайный порядок
              </button>
              <button aria-pressed={s.repeat !== "off"} onClick={s.cycleRepeat}>
                {
                  {
                    off: "Без повтора",
                    one: "Повтор трека",
                    all: "Повтор очереди",
                  }[s.repeat]
                }
              </button>
            </div>
            <Controls />
            <p className="next-label">
              Далее · {s.queue[0]?.title || "Конец очереди"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
function Application({ apkAvailable }) {
  const play = usePlayer((state) => state.play);
  const [address, setAddress] = useState(apiUrl());
  const [notice, setNotice] = useState("");
  return (
    <div className="application">
      <div className="app-symbol">
        <AudioLines size={64} />
      </div>
      <span className="eyebrow">W MUSIC ДЛЯ ANDROID</span>
      <h1>
        Твоя музыка.
        <br />
        Всегда рядом.
      </h1>
      <p>
        Сохраняй любимые треки, открывай новые имена
        <br className="desktop-only" /> и забирай свою волну с собой.
      </p>
      {!native && (
        <>
          <a
            className={`button primary ${apkAvailable ? "" : "disabled"}`}
            aria-disabled={!apkAvailable}
            href={apkAvailable ? "/downloads/app-release.apk" : undefined}
            download
          >
            <Download size={19} /> Скачать APK
          </a>
          {!apkAvailable && (
            <small>APK появится здесь после сборки и публикации.</small>
          )}
        </>
      )}
      <button
        className="button secondary"
        onClick={() => play(demoTrack, [], false)}
      >
        Включить демотрек без сервера
      </button>
      <Profile />
      <form
        className="server-settings"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const url = new URL(address);
            if (
              !["http:", "https:"].includes(url.protocol) ||
              url.username ||
              url.password
            )
              throw new Error();
            setNotice("Проверяем сервер…");
            const health = await api("health", {}, undefined, url.origin);
            if (health?.status !== "ok")
              throw new Error("Не удалось подтвердить работу API W music.");
            localStorage.setItem("wave-api-url", url.origin);
            setAddress(url.origin);
            try {
              await api("search", { q: "lofi", source: "all" });
              setNotice("Сервер подключён. Поиск отвечает.");
            } catch (error) {
              setNotice(`Сервер подключён. Поиск недоступен: ${error.message}`);
            }
          } catch (error) {
            setNotice(
              error instanceof TypeError
                ? "Введите полный HTTP- или HTTPS-адрес сервера."
                : error.message,
            );
          }
        }}
      >
        <label htmlFor="server-url">Адрес музыкального сервера</label>
        <div>
          <input
            id="server-url"
            type="url"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button className="button secondary">Подключить</button>
        </div>
        <small>
          На телефоне укажите адрес сервера в вашей сети или публичный
          HTTPS-адрес.
        </small>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            localStorage.setItem("wave-api-url", DEFAULT_SERVER_URL);
            setAddress(DEFAULT_SERVER_URL);
            setNotice("Адрес восстановлен");
          }}
        >
          Сбросить адрес
        </button>
        <p role="status">{notice}</p>
      </form>
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState("home");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState("Лайки");
  const [full, setFull] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [apkAvailable, setApkAvailable] = useState(false);
  const searchController = useRef(null);
  const s = usePlayer();
  useEffect(() => {
    s.refreshDownloads();
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if (!native)
      fetch("/downloads/app-release.apk", { method: "HEAD" })
        .then((r) =>
          setApkAvailable(
            r.ok && !r.headers.get("content-type")?.includes("text/html"),
          ),
        )
        .catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      searchController.current?.abort();
    };
  }, []);
  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setPage("search");
    s.message("");
    try {
      const data = await api("search", { q: query, source }, controller.signal);
      setResults(data.tracks);
      setSearched(true);
      if (data.errors?.length)
        s.message(data.errors.map((e) => e.message).join(". "));
    } catch (error) {
      if (!controller.signal.aborted) {
        setResults([]);
        s.message(error.message);
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  const matchingArtist = results.find(
    (track) => track.artist.toLowerCase() === query.trim().toLowerCase(),
  );
  const navigate = (id) => {
    setPage(id);
    setFull(false);
  };
  return (
    <div className={`app-shell ${s.current ? "has-player" : ""}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("home")}>
          <span>
            <AudioLines />
          </span>
          W <span className="brand-light">music</span>
        </button>
        <nav aria-label="Основная навигация">
          {navigation.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={21} />
              <span>{title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> На твоей частоте
          <p>Музыка, которая чувствует тебя.</p>
        </div>
      </aside>
      <main inert={full ? true : undefined}>
        <header className="topbar">
          <span className="mobile-brand">
            <AudioLines /> W music
          </span>
          <form className="search-box" onSubmit={search}>
            <Search size={20} />
            <input
              aria-label="Поиск музыки"
              placeholder="Трек, исполнитель или настроение"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" aria-label="Найти">
              <ArrowUpRight size={19} />
            </button>
          </form>
          <span className="top-caption">СЛУШАЙ. ЧУВСТВУЙ. ОТКРЫВАЙ.</span>
        </header>
        <div className="content">
          {offline && (
            <div className="offline-note">
              <WifiOff size={16} /> Офлайн · Скачанные треки доступны в
              медиатеке
            </div>
          )}
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">МУЗЫКА ТВОЕГО ДНЯ</span>
                  <h1>На твоей частоте</h1>
                </div>
                <span className="live-label">
                  <span /> Твой личный поток
                </span>
              </div>
              <section
                className={`wave-hero ${s.playing && s.wave ? "is-playing" : ""}`}
              >
                <div className="orb">
                  <div />
                  <div />
                  <div />
                </div>
                <div className="hero-content">
                  <span className="eyebrow">
                    <Radio size={15} /> ПОДСТРАИВАЕТСЯ ПОД ТЕБЯ
                  </span>
                  <h2>
                    Моя волна<span>Твой ритм. Твои правила.</span>
                  </h2>
                  <p>
                    Любимые треки и будущие открытия
                    <br />в одном бесконечном потоке.
                  </p>
                  <button
                    className="button hero-play"
                    disabled={s.loading}
                    onClick={s.wave && s.current ? s.toggle : s.startWave}
                  >
                    {s.loading ? (
                      <LoaderCircle className="spin" size={20} />
                    ) : s.wave && s.playing ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )}
                    {s.wave && s.playing ? "Приостановить" : "Поймать волну"}
                  </button>
                </div>
                <div className="mood-bar">
                  <span>Как ты сегодня?</span>
                  <div>
                    {["Всё", "Бодрое", "Чилл", "Ночь"].map((m) => (
                      <button
                        className={s.mood === m ? "chosen" : ""}
                        key={m}
                        onClick={() => {
                          s.setMood(m);
                          if (s.wave) s.startWave();
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <h2>Настроение на сейчас</h2>
                  <span>Найди своё звучание</span>
                </div>
                <div className="mood-cards">
                  {[
                    {
                      name: "На полной громкости",
                      mood: "Бодрое",
                      sub: "Больше энергии",
                      className: "energy",
                    },
                    {
                      name: "Замедлить время",
                      mood: "Чилл",
                      sub: "Меньше суеты",
                      className: "chill",
                    },
                    {
                      name: "После полуночи",
                      mood: "Ночь",
                      sub: "Глубже в музыку",
                      className: "night",
                    },
                  ].map((card) => (
                    <button
                      className={`mood-card ${card.className}`}
                      key={card.mood}
                      onClick={() => {
                        s.setMood(card.mood);
                        s.startWave();
                      }}
                    >
                      <span className="card-art">
                        <AudioLines />
                      </span>
                      <span>
                        <small>{card.sub}</small>
                        <strong>{card.name}</strong>
                      </span>
                      <span className="round-play">
                        <Play size={17} fill="currentColor" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <h2>
                    {s.queue.length ? "Дальше на волне" : "Недавно слушали"}
                  </h2>
                  <button
                    onClick={() => {
                      setTab("История");
                      navigate("library");
                    }}
                  >
                    Вся история <ArrowUpRight size={16} />
                  </button>
                </div>
                <TrackList
                  tracks={(s.queue.length ? s.queue : s.history).slice(0, 5)}
                  empty="Запустите волну или найдите любимого исполнителя"
                />
              </section>
              {!native && (
                <section className="download-banner">
                  <div className="phone-badge">
                    <Smartphone size={30} />
                  </div>
                  <div>
                    <h3>Забери музыку с собой</h3>
                    <p>W music для Android. Твоя волна всегда под рукой.</p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => navigate("app")}
                  >
                    Приложение <ArrowUpRight size={17} />
                  </button>
                </section>
              )}
            </>
          )}
          {page === "search" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ОТКРОЙ НОВОЕ</span>
                  <h1>Поиск музыки</h1>
                </div>
              </div>
              <div className="tabs">
                {[
                  ["all", "Все источники"],
                  ["yt", "YouTube Music"],
                  ["sc", "SoundCloud"],
                ].map(([id, name]) => (
                  <button
                    className={source === id ? "chosen" : ""}
                    key={id}
                    onClick={() => setSource(id)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="muted">
                Введите запрос в строке поиска и нажмите Enter.
              </p>
              {searching ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <p>Ищем вашу музыку…</p>
                </div>
              ) : (
                <>
                  {matchingArtist && (
                    <div className="artist-summary">
                      <strong>{matchingArtist.artist}</strong>
                      <div>{artistSummary(matchingArtist.artistStats)}</div>
                    </div>
                  )}
                  <TrackList
                    tracks={results}
                    empty={
                      searched
                        ? "Ничего не найдено. Попробуйте другой запрос."
                        : "Два музыкальных мира. Один поиск."
                    }
                  />
                </>
              )}
            </>
          )}
          {page === "library" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ТО, ЧТО ОСТАЁТСЯ С ТОБОЙ</span>
                  <h1>Медиатека</h1>
                </div>
              </div>
              <div className="tabs">
                {["Лайки", "Скачанные", "История"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "chosen" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <TrackList
                tracks={
                  tab === "Лайки"
                    ? s.likes
                    : tab === "Скачанные"
                      ? s.downloads
                      : s.history
                }
                downloaded={tab === "Скачанные"}
                empty={
                  tab === "Лайки"
                    ? "Отмечайте любимые треки сердечком"
                    : tab === "Скачанные"
                      ? "Скачайте трек, чтобы слушать его без интернета"
                      : "Здесь появятся прослушанные треки"
                }
              />
            </>
          )}
          {page === "app" && <Application apkAvailable={apkAvailable} />}
        </div>
        <footer>
          W music <span>Твоя музыка. Твоя частота.</span>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {navigation.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? "selected" : ""}
            onClick={() => navigate(id)}
          >
            <Icon size={22} />
            <span>{title}</span>
          </button>
        ))}
      </nav>
      <Player full={full} setFull={setFull} />
      {s.error && (
        <div className="toast" role="alert">
          <span>{s.error}</span>
          <IconButton label="Закрыть уведомление" onClick={() => s.message("")}>
            <X size={18} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
