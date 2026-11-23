import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useProfiles = create(
  persist(
    (set) => ({
      activeId: null,
      profiles: {},
      signIn(id) {
        set({ activeId: id });
      },
      signOut() {
        set({ activeId: null });
      },
      add(name) {
        const id = crypto.randomUUID();
        set((state) => ({
          activeId: id,
          profiles: { ...state.profiles, [id]: { name, tracks: {} } },
        }));
      },
      rename(id, name) {
        set((state) => ({
          profiles: {
            ...state.profiles,
            [id]: { ...state.profiles[id], name },
          },
        }));
      },
      listen(id, track, seconds) {
        set((state) => {
          const profile = state.profiles[id];
          if (!profile || state.activeId !== id) return state;
          const key = `${track.source}:${track.id}`;
          const entry = {
            title: track.title,
            artist: track.artist,
            seconds: (profile.tracks[key]?.seconds || 0) + seconds,
            lastPlayed: Date.now(),
          };
          return {
            profiles: {
              ...state.profiles,
              [id]: { ...profile, tracks: { ...profile.tracks, [key]: entry } },
            },
          };
        });
      },
    }),
    { name: "wavemusic-profiles" },
  ),
);
