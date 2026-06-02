import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PALETTES,
  DEFAULT_THEME,
  setActivePalette,
  makePaperTheme,
  type Palette,
  type ThemeMode,
} from '../theme';

const STORAGE_KEY = 'bettrmind.theme';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: Palette;
  paperTheme: ReturnType<typeof makePaperTheme>;
  setMode: (mode: ThemeMode) => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME);
  const [ready, setReady] = useState(false);

  // Load the saved theme once at startup.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!active) return;
        const m: ThemeMode = saved === 'purple' || saved === 'navy' ? saved : DEFAULT_THEME;
        setActivePalette(m);
        setModeState(m);
      })
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setActivePalette(next); // keep the module-level `colors` in sync
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const colors = PALETTES[mode];
    return { mode, colors, paperTheme: makePaperTheme(colors), setMode, ready };
  }, [mode, setMode, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
