import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { useAuth } from '../src/context/AuthContext';
import { getDailyLogs, getRecentEvents, todayKey } from '../src/db/database';
import type { DailyLog, AccessEvent, EventAction } from '../src/types';

const ACTION_META: Record<
  EventAction,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; label: string }
> = {
  resisted: { icon: 'shield-check', color: colors.teal, label: 'urge resisted' },
  proceeded: {
    icon: 'arrow-right-circle',
    color: colors.danger,
    label: 'proceeded after pause',
  },
  opened: { icon: 'cellphone-arrow-down', color: colors.textMuted, label: 'app opened' },
};

function prettyDate(key: string): string {
  if (key === todayKey()) return 'Today';
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function prettyTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export default function Journal() {
  const router = useRouter();
  const { user } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (user) {
        getDailyLogs(user.id).then((r) => active && setLogs(r));
        getRecentEvents(user.id).then((r) => active && setEvents(r));
      }
      return () => {
        active = false;
      };
    }, [user])
  );

  if (!user) return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={22}
          iconColor={colors.text}
          onPress={() => router.back()}
        />
        <Text style={styles.title}>activity logs</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>daily logs</Text>
        {logs.length === 0 && (
          <Text style={styles.empty}>
            No activity yet. Your daily logs will appear here once detection is
            triggered.
          </Text>
        )}
        {logs.map((log) => (
          <View key={log.day} style={styles.dayCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayDate}>{prettyDate(log.day)}</Text>
              <Text style={styles.dayMeta}>{log.day}</Text>
            </View>
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={log.gambling_count > 0 ? colors.danger : colors.textFaint}
              />
              <Text
                style={[
                  styles.badgeNum,
                  {
                    color:
                      log.gambling_count > 0 ? colors.danger : colors.textFaint,
                  },
                ]}
              >
                {log.gambling_count}
              </Text>
              <Text style={styles.badgeLabel}>gambling</Text>
            </View>
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={16}
                color={colors.teal}
              />
              <Text style={[styles.badgeNum, { color: colors.teal }]}>
                {log.resisted_count}
              </Text>
              <Text style={styles.badgeLabel}>resisted</Text>
            </View>
          </View>
        ))}

        <Text style={[styles.section, { marginTop: spacing(3) }]}>
          apps opened
        </Text>
        <Text style={styles.empty}>
          Every app you open is logged here — even ones not on the monitored list.
        </Text>
        {events.length === 0 && (
          <Text style={styles.empty}>No app activity recorded yet.</Text>
        )}
        {events.map((ev) => {
          const meta = ACTION_META[ev.action] ?? ACTION_META.opened;
          return (
            <View key={ev.id} style={styles.eventRow}>
              <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
              <View style={{ flex: 1, marginLeft: spacing(1.5) }}>
                <Text style={styles.eventApp}>
                  {ev.app_name} <Text style={styles.eventCat}>· {ev.category}</Text>
                </Text>
                <Text style={styles.eventAction}>{meta.label}</Text>
              </View>
              <Text style={styles.eventTime}>{prettyTime(ev.created_at)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing(1),
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  content: { padding: spacing(2), paddingBottom: spacing(4) },
  section: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing(1),
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing(1),
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(2),
    marginBottom: spacing(1),
  },
  dayDate: { color: colors.text, fontSize: 15, fontWeight: '700' },
  dayMeta: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
  badge: { alignItems: 'center', marginLeft: spacing(2) },
  badgeNum: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  badgeLabel: { color: colors.textFaint, fontSize: 10 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing(1.5),
    marginBottom: spacing(0.75),
  },
  eventApp: { color: colors.text, fontSize: 14, fontWeight: '700' },
  eventCat: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  eventAction: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  eventTime: { color: colors.textFaint, fontSize: 12 },
});
