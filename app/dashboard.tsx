import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { parsePhotos } from '../src/photos';
import { OutlineButton, StatTile } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  getStats,
  getSettings,
  getEnabledTriggerApps,
  recordEvent,
  getUnnotifiedSuggestions,
  markSuggestionsNotified,
} from '../src/db/database';
import {
  detectionAvailable,
  startMonitoring,
  configureReminder,
  getPendingOpens,
  clearPendingOpens,
  consumeLaunchTrigger,
} from '../src/native/detector';
import type { Stats } from '../src/types';

export default function Dashboard() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [monitoringOn, setMonitoringOn] = useState(true);
  const [suggestToast, setSuggestToast] = useState('');

  // Drain the native monitor's buffer into the activity logs, (re)start the
  // service with the latest trigger list, and surface any pending reminder.
  const syncDetection = useCallback(
    async (userId: number) => {
      if (!detectionAvailable) return;
      const settings = await getSettings(userId);
      if (!settings.monitoring_granted) return;

      const opens = getPendingOpens();
      if (opens.length > 0) {
        for (const o of opens) {
          await recordEvent({
            userId,
            appName: o.appName,
            category: o.category,
            action: o.action,
          });
        }
        clearPendingOpens();
      }

      const apps = await getEnabledTriggerApps();
      startMonitoring(apps);
      configureReminder(
        settings.family_member,
        settings.family_message,
        settings.countdown_seconds,
        parsePhotos(settings.motivation_photo)
      );

      const trigger = consumeLaunchTrigger();
      if (trigger) {
        router.push({
          pathname: '/reminder',
          params: { app: trigger.appName, category: trigger.category },
        });
      }
    },
    [router]
  );

  const refresh = useCallback((userId: number) => {
    getStats(userId).then(setStats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (user) {
        getSettings(user.id).then((s) => {
          if (active) setMonitoringOn(!!s.monitoring_granted);
        });
        syncDetection(user.id).finally(() => {
          if (active) refresh(user.id);
        });
      }
      return () => {
        active = false;
      };
    }, [user, syncDetection, refresh])
  );

  // Tell the user once when the admin has approved (or rejected) an app they
  // suggested to block.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (user) {
        getUnnotifiedSuggestions(user.id).then((list) => {
          if (!active || list.length === 0) return;
          const approved = list
            .filter((s) => s.status === 'approved')
            .map((s) => s.app_name);
          const rejected = list
            .filter((s) => s.status === 'rejected')
            .map((s) => s.app_name);
          const parts: string[] = [];
          if (approved.length > 0) {
            parts.push(
              `${approved.join(', ')} ${approved.length > 1 ? 'are' : 'is'} now being blocked`
            );
          }
          if (rejected.length > 0) {
            parts.push(
              `${rejected.join(', ')} ${rejected.length > 1 ? 'were' : 'was'} not added`
            );
          }
          setSuggestToast(`${parts.join('. ')}.`);
          markSuggestionsNotified(list.map((s) => s.id));
        });
      }
      return () => {
        active = false;
      };
    }, [user])
  );

  // The monitor brings us to the foreground when a trigger app opens — re-sync
  // on resume so the reminder fires and the logs catch up.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncDetection(user.id).then(() => refresh(user.id));
    });
    return () => sub.remove();
  }, [user, syncDetection, refresh]);

  if (!user) return <Redirect href="/login" />;

  const firstName = (user.name || '').split(' ')[0] || 'friend';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Branded header */}
      <View style={styles.header}>
        <Text style={styles.brand}>BettrMind</Text>
        <IconButton
          icon="cog-outline"
          size={22}
          iconColor={colors.textMuted}
          onPress={() => router.push('/settings')}
          style={styles.gear}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Monitoring-off banner (when the user skipped the permission step) */}
        {!monitoringOn && (
          <Pressable
            style={styles.banner}
            onPress={() => router.push('/permission')}
            android_ripple={{ color: 'rgba(0,0,0,0.12)', borderless: false }}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="alert-outline" size={20} color={colors.onTeal} />
            <Text style={styles.bannerText}>
              Monitoring is off — reminders won't trigger. Tap to enable.
            </Text>
          </Pressable>
        )}

        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.welcomeName}>{firstName}</Text>

        {/* Bet-free streak hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Days Bet-Free</Text>
          <Text style={styles.heroNumber}>{stats ? stats.streakDays : '—'}</Text>
          <Text style={styles.heroSub}>Keep Going</Text>

          {/* Stat tiles */}
          <View style={styles.tileRow}>
            <StatTile
              value={stats ? stats.urgesBlocked : 0}
              label="Urges Blocked"
              style={{ marginRight: spacing(1) }}
            />
            <StatTile
              value={stats ? `${stats.longestStreakWeeks} wks` : '0 wks'}
              label="Best Streak"
              style={{ marginLeft: spacing(1) }}
            />
          </View>

          <OutlineButton
            label="View Activity Logs"
            onPress={() => router.push('/journal')}
            style={{ marginTop: spacing(2.5), alignSelf: 'stretch' }}
          />
        </View>

        {/* Suggest an app to block (goes to admin for review) */}
        <Pressable
          style={styles.suggestRow}
          onPress={() => router.push('/suggest-app')}
          android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.teal} />
          <Text style={styles.suggestText}>Suggest an App to Block</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.greeting}>Stay strong, {firstName}.</Text>
      </ScrollView>

      <Snackbar
        visible={suggestToast.length > 0}
        onDismiss={() => setSuggestToast('')}
        duration={6000}
        action={{ label: 'OK', onPress: () => setSuggestToast('') }}
      >
        {suggestToast}
      </Snackbar>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingLeft: spacing(2.5),
      paddingRight: spacing(1),
      paddingVertical: spacing(1),
    },
    brand: { color: colors.text, fontSize: 20, fontWeight: '800' },
    gear: { margin: 0 },
    content: { padding: spacing(2), paddingBottom: spacing(4) },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1),
      backgroundColor: colors.teal,
      borderRadius: radius.md,
      padding: spacing(1.5),
      marginBottom: spacing(2),
      overflow: 'hidden',
    },
    bannerText: { color: colors.onTeal, fontSize: 13, fontWeight: '700', flex: 1 },
    welcome: { color: colors.textMuted, fontSize: 15, marginLeft: spacing(0.5) },
    welcomeName: {
      color: colors.text,
      fontSize: 26,
      fontWeight: '800',
      marginLeft: spacing(0.5),
      marginBottom: spacing(2),
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing(3),
      alignItems: 'center',
    },
    heroLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
    heroNumber: {
      color: colors.teal,
      fontSize: 72,
      fontWeight: '800',
      lineHeight: 80,
      marginTop: spacing(0.5),
    },
    heroSub: { color: colors.teal, fontSize: 15, fontWeight: '600' },
    tileRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing(2.5) },
    suggestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1),
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing(2),
      marginTop: spacing(2),
      overflow: 'hidden',
    },
    suggestText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
    greeting: {
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: spacing(3),
      fontSize: 13,
    },
  });
