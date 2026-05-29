import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  useWindowDimensions,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Light haptic tap on press — silently ignored where unsupported (e.g. web). */
function tap(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Spring scale-down while pressed, for a tactile feel on both platforms. */
function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      bounciness: 0,
      speed: 40,
    }).start();
  }, [scale]);
  const pressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 40,
    }).start();
  }, [scale]);
  return { scale, pressIn, pressOut };
}

/**
 * Button padding + font size that scale with the device width
 * (clamped so it never gets tiny on small phones or huge on tablets).
 */
function useButtonMetrics() {
  const { width } = useWindowDimensions();
  const factor = Math.min(Math.max(width / 375, 0.9), 1.25);
  return {
    paddingVertical: Math.round(spacing(2) * factor),
    fontSize: Math.round(16 * factor),
  };
}

const RIPPLE = { color: 'rgba(0,0,0,0.12)', borderless: false } as const;

interface ButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** Mint pill — the primary call to action (e.g. "open e-wallet"). */
export function PrimaryButton({ label, onPress, style, disabled }: ButtonProps) {
  const { scale, pressIn, pressOut } = usePressScale();
  const m = useButtonMetrics();
  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') tap();
    onPress();
  }, [onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={RIPPLE}
      style={[
        styles.primary,
        { paddingVertical: m.paddingVertical, transform: [{ scale }] },
        disabled && styles.primaryDisabled,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.primaryLabel, { fontSize: m.fontSize }]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** Dark outlined pill — secondary action (e.g. "view journal"). */
export function OutlineButton({ label, onPress, style, disabled }: ButtonProps) {
  const { scale, pressIn, pressOut } = usePressScale();
  const m = useButtonMetrics();
  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') tap();
    onPress();
  }, [onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: 'rgba(255,255,255,0.10)', borderless: false }}
      style={[
        styles.outline,
        { paddingVertical: m.paddingVertical, transform: [{ scale }] },
        disabled && styles.primaryDisabled,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.outlineLabel, { fontSize: m.fontSize }]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

interface StatTileProps {
  value: string | number;
  label: string;
  style?: StyleProp<ViewStyle>;
}

/** Small dark stat tile (e.g. "3 urges resisted"). */
export function StatTile({ value, label, style }: StatTileProps) {
  return (
    <View style={[styles.tile, style]}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** BettrMind branded top bar with a faux clock, matching the mockups. */
export function BrandHeader({ time = '9:41' }: { time?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>BettrMind</Text>
      <Text style={styles.clock}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // keep the ripple within the rounded corners
  },
  primaryDisabled: { opacity: 0.5 },
  primaryLabel: {
    color: colors.onTeal,
    fontWeight: '700',
    textAlign: 'center',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  outlineLabel: {
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(1.5),
    alignItems: 'center',
  },
  tileValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  tileLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing(2.5),
    paddingTop: spacing(2),
    paddingBottom: spacing(1.5),
  },
  brand: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  clock: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
