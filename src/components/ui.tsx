import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** Mint pill — the primary call to action (e.g. "open e-wallet"). */
export function PrimaryButton({ label, onPress, style, disabled }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** Dark outlined pill — secondary action (e.g. "view journal"). */
export function OutlineButton({ label, onPress, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.outline, pressed && styles.pressed, style]}
    >
      <Text style={styles.outlineLabel}>{label}</Text>
    </Pressable>
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

/** SafeWallet branded top bar with a faux clock, matching the mockups. */
export function BrandHeader({ time = '9:41' }: { time?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>SafeWallet</Text>
      <Text style={styles.clock}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: spacing(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.5 },
  primaryLabel: {
    color: colors.onTeal,
    fontSize: 16,
    fontWeight: '700',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingVertical: spacing(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: { opacity: 0.75 },
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
