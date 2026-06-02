import { MD3DarkTheme } from 'react-native-paper';

/**
 * BettrMind design tokens.
 *
 * Two switchable palettes (chosen in Settings):
 *  - 'navy'   : deep ocean-blue canvas, sky-blue accent  (referenceUis/color1.png)
 *  - 'purple' : dark indigo canvas, violet cards, white accent (color2.png)
 *
 * Both palettes share the SAME keys so every screen can read `colors.<key>`
 * unchanged — only the values differ. The historical key `teal` now means
 * "primary accent" (kept named `teal` to avoid churn across the app).
 */
export interface Palette {
  background: string; // app canvas
  surface: string; // cards / stat tiles
  surfaceAlt: string; // nested / lighter card
  card: string; // bright "photo/message" card
  cardText: string; // text on the bright card
  teal: string; // PRIMARY accent (big numbers, primary buttons)
  tealDark: string; // deep accent (message card bg)
  tealDarker: string;
  onTeal: string; // text/icon on a primary button
  text: string;
  textMuted: string;
  textFaint: string;
  outline: string; // outlined-button border
  danger: string;
  success: string;
}

export type ThemeMode = 'navy' | 'purple';

/** Navy — referenceUis/color1.png */
export const navyPalette: Palette = {
  background: '#0E1E33',
  surface: '#1B3A5B',
  surfaceAlt: '#244D74',
  card: '#EAF3FF',
  cardText: '#0E1E33',
  teal: '#5BB0F2', // sky-blue accent
  tealDark: '#13314F',
  tealDarker: '#0E2740',
  onTeal: '#062A47', // dark navy text on the bright blue button
  text: '#FFFFFF',
  textMuted: '#9DB2CC',
  textFaint: '#6B829E',
  outline: '#395A7E',
  danger: '#F2545B',
  success: '#5BB0F2',
};

/** Purple — referenceUis/color2.png */
export const purplePalette: Palette = {
  background: '#1A1530',
  surface: '#3A2F63',
  surfaceAlt: '#4A3C7D',
  card: '#FFFFFF',
  cardText: '#241B45',
  teal: '#FFFFFF', // primary buttons are white in this theme
  tealDark: '#2C2350',
  tealDarker: '#231B41',
  onTeal: '#2A1F4D', // dark purple text on the white button
  text: '#FFFFFF',
  textMuted: '#B6ABD9',
  textFaint: '#8478AE',
  outline: '#5B4E86',
  danger: '#F2545B',
  success: '#9D8BF0',
};

export const PALETTES: Record<ThemeMode, Palette> = {
  navy: navyPalette,
  purple: purplePalette,
};

export const DEFAULT_THEME: ThemeMode = 'navy';

/**
 * Mutable live palette. Screens that read the module-level `colors` (e.g. the
 * navigation container) still work; screens that need to re-render on a theme
 * switch use the `useTheme()` hook + `makeStyles(colors)` instead.
 */
export let colors: Palette = { ...navyPalette };

export function setActivePalette(mode: ThemeMode): void {
  colors = { ...PALETTES[mode] };
}

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 28,
} as const;

export const spacing = (n: number): number => n * 8;

/** Build a Paper theme from a palette (used by the dynamic PaperProvider). */
export function makePaperTheme(c: Palette) {
  return {
    ...MD3DarkTheme,
    roundness: 16,
    colors: {
      ...MD3DarkTheme.colors,
      primary: c.teal,
      onPrimary: c.onTeal,
      background: c.background,
      surface: c.surface,
      surfaceVariant: c.surfaceAlt,
      onSurface: c.text,
      onSurfaceVariant: c.textMuted,
      outline: c.outline,
      error: c.danger,
      secondaryContainer: c.tealDark,
    },
  };
}

/** Default Paper theme (navy) — kept for any non-reactive import sites. */
export const paperTheme = makePaperTheme(navyPalette);
