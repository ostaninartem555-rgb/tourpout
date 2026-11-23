import { useState } from "react";
import { useProfiles } from "./profiles";
import { audio } from "./store";

export default function Profile() {
  const state = useProfiles();
  const profile = state.profiles[state.activeId];
  const [name, setName] = useState("");
  const tracks = Object.entries(profile?.tracks || {}).sort(
    (a, b) => b[1].lastPlayed - a[1].lastPlayed,
  );
  function switchProfile(change) {
    audio.pause();
    change();
    setName("");
  }
  return (
    <section className="server-settings">
      <h2>{profile ? `Профиль · ${profile.name}` : "Вход в профиль"}</h2>
      <p>Профили и история прослушиваний сохраняются на этом устройстве.</p>
      {profile ? (
        <>
          <p>
            Прослушано{" "}
            {Math.floor(
              tracks.reduce((sum, [, track]) => sum + track.seconds, 0),
            )}{" "}
            сек. · Треков {tracks.length}
          </p>
          <ul>
            {tracks.map(([id, track]) => (
              <li key={id}>
                {track.title} · {track.artist} · {Math.floor(track.seconds)}{" "}
                сек.
              </li>
            ))}
          </ul>
          <button
            className="button secondary"
            onClick={() => switchProfile(state.signOut)}
          >
            Выйти
          </button>
        </>
      ) : (
        Object.entries(state.profiles).map(([id, item]) => (
          <button
            key={id}
            className="button secondary"
            onClick={() => switchProfile(() => state.signIn(id))}
          >
            {item.name}
          </button>
        ))
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          if (profile) {
            state.rename(state.activeId, name.trim());
            setName("");
          } else switchProfile(() => state.add(name.trim()));
        }}
      >
        <label htmlFor="profile-name">
          {profile ? "Изменить имя" : "Имя нового профиля"}
        </label>
        <input
          id="profile-name"
          maxLength={48}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="button secondary">
          {profile ? "Сохранить имя" : "Создать профиль и войти"}
        </button>
      </form>
    </section>
  );
}
