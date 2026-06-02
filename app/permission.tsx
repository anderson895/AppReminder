import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, AppState, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  setMonitoringGranted,
  getEnabledTriggerApps,
  getSettings,
} from '../src/db/database';
import {
  detectionAvailable,
  hasUsageAccess,
  openUsageAccessSettings,
  hasOverlayPermission,
  openOverlaySettings,
  startMonitoring,
  configureReminder,
} from '../src/native/detector';

/** Memoized, theme-aware styles shared by Permission + PermRow. */
function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

export default function Permission() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const [usageOk, setUsageOk] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (detectionAvailable) {
      setUsageOk(hasUsageAccess());
      setOverlayOk(hasOverlayPermission());
    }
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!user) return <Redirect href="/login" />;

  const finish = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await setMonitoringGranted(user.id, true);
    if (detectionAvailable) {
      const apps = await getEnabledTriggerApps();
      startMonitoring(apps);
      const s = await getSettings(user.id);
      configureReminder(s.family_member, s.family_message, s.countdown_seconds);
    }
    router.replace('/setup-motivation');
  };

  const skip = () => router.replace('/setup-motivation');

  // In Expo Go there is no native module — record consent only, explain the limit.
  if (!detectionAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="shield-account" size={44} color={colors.onTeal} />
          </View>
          <Text style={styles.title}>enable app monitoring</Text>
          <Text style={styles.subtitle}>
            Real background detection runs only in the installed BettrMind app. In this
            preview the permission step is recorded so the flow is complete.
          </Text>
          <PrimaryButton
            label="allow & continue"
            onPress={finish}
            disabled={busy}
            style={{ marginTop: spacing(3) }}
          />
          <OutlineButton label="not now" onPress={skip} style={{ marginTop: spacing(1.5) }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="shield-account" size={44} color={colors.onTeal} />
        </View>
        <Text style={styles.title}>enable app monitoring</Text>
        <Text style={styles.subtitle}>
          BettrMind needs these so it can notice when you open a gambling or financial
          app and remind you before you continue.
        </Text>

        <PermRow
          icon="eye-check-outline"
          title="Usage access"
          desc="See which app is currently open."
          granted={usageOk}
          onPress={openUsageAccessSettings}
        />
        <PermRow
          icon="application-outline"
          title="Display over other apps"
          desc="Show the reminder on top of the opened app."
          granted={overlayOk}
          onPress={openOverlaySettings}
        />

        <View style={styles.notice}>
          <MaterialCommunityIcons name="lock-check-outline" size={18} color={colors.textMuted} />
          <Text style={styles.noticeText}>
            BettrMind only checks the app you open against the monitored list. It never
            reads your messages, transactions, or balances.
          </Text>
        </View>

        <PrimaryButton
          label={busy ? 'enabling…' : usageOk ? 'enable & continue' : 'grant Usage access first'}
          onPress={finish}
          disabled={busy || !usageOk}
          style={{ marginTop: spacing(3) }}
        />
        <OutlineButton label="not now" onPress={skip} style={{ marginTop: spacing(1.5) }} />
        <Text style={styles.footNote}>
          Reminders won't trigger until at least Usage access is granted.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermRow({
  icon,
  title,
  desc,
  granted,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  desc: string;
  granted: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.permCard}>
      <View style={styles.permIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{desc}</Text>
      </View>
      {granted ? (
        <View style={styles.grantedPill}>
          <MaterialCommunityIcons name="check" size={16} color={colors.onTeal} />
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          android_ripple={{ color: 'rgba(47,227,168,0.25)', borderless: false }}
          style={styles.grantBtn}
        >
          <Text style={styles.grantBtnText}>grant</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(3), paddingBottom: spacing(5), flexGrow: 1 },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing(2),
    marginBottom: spacing(2),
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing(1),
    marginBottom: spacing(3),
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(2),
    marginBottom: spacing(1.5),
  },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(1.5),
  },
  permTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  permDesc: { color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  grantBtn: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.75),
    overflow: 'hidden',
  },
  grantBtnText: { color: colors.teal, fontWeight: '700', fontSize: 13 },
  grantedPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1), marginTop: spacing(1) },
  noticeText: { color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 },
  footNote: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing(2),
    lineHeight: 17,
  },
});
