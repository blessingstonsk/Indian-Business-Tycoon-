import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
  muted: boolean;
  volume: number;
  reduceMotion: boolean;
  setTheme: (t: Theme) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setReduceMotion: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      muted: false,
      volume: 0.6,
      reduceMotion: false,
      setTheme: (theme) => set({ theme }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      setVolume: (volume) => set({ volume }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    { name: 'ibt-settings' },
  ),
);

export function prefersReducedMotion(): boolean {
  const sys = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return useSettings.getState().reduceMotion || Boolean(sys);
}

export function useReducedMotion(): boolean {
  const pref = useSettings((s) => s.reduceMotion);
  const sys = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return pref || Boolean(sys);
}
