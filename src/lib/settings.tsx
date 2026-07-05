import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export interface Settings {
  wpm: number;
  fontScale: number;
  theme: 'dark' | 'light';
  chunk: 1 | 2;
}

export const WPM_MIN = 100;
export const WPM_MAX = 700;
export const WPM_STEP = 25;

const DEFAULTS: Settings = { wpm: 300, fontScale: 1, theme: 'dark', chunk: 1 };
const STORAGE_KEY = 'speedread:settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      wpm: clampWpm(Number(parsed.wpm) || DEFAULTS.wpm),
      fontScale: Number(parsed.fontScale) || DEFAULTS.fontScale,
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      chunk: parsed.chunk === 2 ? 2 : 1,
    };
  } catch {
    return DEFAULTS;
  }
}

export function clampWpm(wpm: number): number {
  return Math.min(WPM_MAX, Math.max(WPM_MIN, wpm));
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULTS,
  update: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', settings.theme === 'dark' ? '#0b0e14' : '#f5f2ea');
  }, [settings.theme]);

  return (
    <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
