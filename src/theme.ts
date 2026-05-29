import { MD3DarkTheme } from 'react-native-paper';

/**
 * SafeWallet design tokens — derived from the reference UI mockups.
 * Dark charcoal canvas, mint/teal accent, white + dark-teal cards.
 */
export const colors = {
  background: '#2C2C2E', // app canvas
  surface: '#3A3A3C', // dark cards / stat tiles
  surfaceAlt: '#454547', // slightly lighter dark card
  card: '#FFFFFF', // white "money not gambled" card
  cardText: '#1C1C1E', // text on white card
  teal: '#2FE3A8', // primary mint accent (big numbers, primary buttons)
  tealDark: '#1F6E5C', // dark-teal "family photo" / message card
  tealDarker: '#185446',
  onTeal: '#0C2A23', // text/icon on mint buttons
  text: '#FFFFFF',
  textMuted: '#9AA0A6',
  textFaint: '#6E7378',
  outline: '#54555A', // outlined secondary button border
  danger: '#F2545B',
  success: '#2FE3A8',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 28,
} as const;

export const spacing = (n: number): number => n * 8;

export const paperTheme = {
  ...MD3DarkTheme,
  roundness: 16,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.teal,
    onPrimary: colors.onTeal,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceAlt,
    onSurface: colors.text,
    onSurfaceVariant: colors.textMuted,
    outline: colors.outline,
    error: colors.danger,
    secondaryContainer: colors.tealDark,
  },
};
