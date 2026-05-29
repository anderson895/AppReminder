import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Switch, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { useAuth } from '../src/context/AuthContext';
import { getMonitoredApps, toggleMonitoredApp } from '../src/db/database';
import type { MonitoredApp } from '../src/types';

const ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  GCash: 'wallet',
  Maya: 'credit-card-outline',
  GrabPay: 'car',
  'Online Casino': 'cards-playing-outline',
  'Sports Betting': 'soccer',
  eBingo: 'dice-multiple-outline',
};

export default function Apps() {
  const router = useRouter();
  const { user } = useAuth();
  const [apps, setApps] = useState<MonitoredApp[]>([]);

  const load = useCallback(() => {
    if (user) getMonitoredApps(user.id).then(setApps);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!user) return <Redirect href="/login" />;

  const onToggle = async (app: MonitoredApp): Promise<void> => {
    await toggleMonitoredApp(app.id, !app.enabled);
    load();
  };

  const onSimulate = (app: MonitoredApp) => {
    if (!app.enabled) return;
    router.push({
      pathname: '/reminder',
      params: { app: app.app_name, category: app.category },
    });
  };

  const gambling = apps.filter((a) => a.category === 'gambling');
  const financial = apps.filter((a) => a.category === 'financial');

  const Section = ({ title, data }: { title: string; data: MonitoredApp[] }) => (
    <>
      <Text style={styles.section}>{title}</Text>
      {data.map((app) => (
        <View key={app.id} style={styles.row}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons
              name={ICONS[app.app_name] ?? 'cellphone'}
              size={22}
              color={app.enabled ? colors.teal : colors.textFaint}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>{app.app_name}</Text>
            <Text style={styles.appCat}>
              {app.category === 'gambling' ? 'gambling app' : 'financial app'}
            </Text>
          </View>
          <Pressable
            onPress={() => onSimulate(app)}
            disabled={!app.enabled}
            style={[styles.testBtn, !app.enabled && styles.testBtnOff]}
          >
            <Text style={[styles.testLabel, !app.enabled && styles.testLabelOff]}>
              test
            </Text>
          </Pressable>
          <Switch
            value={!!app.enabled}
            onValueChange={() => onToggle(app)}
            color={colors.teal}
          />
        </View>
      ))}
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={22}
          iconColor={colors.text}
          onPress={() => router.back()}
        />
        <Text style={styles.title}>monitored apps</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>
          SafeWallet watches these apps. Tap <Text style={styles.noteHi}>test</Text> to
          simulate the system detecting that you opened the app and trigger the reminder
          flow.
        </Text>
        <Section title="gambling" data={gambling} />
        <Section title="financial" data={financial} />
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
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing(2),
  },
  noteHi: { color: colors.teal, fontWeight: '700' },
  section: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing(2),
    marginBottom: spacing(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(1.5),
    marginBottom: spacing(1),
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(1.5),
  },
  appName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  appCat: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  testBtn: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(0.5),
    marginRight: spacing(1),
  },
  testBtnOff: { borderColor: colors.outline },
  testLabel: { color: colors.teal, fontWeight: '700', fontSize: 13 },
  testLabelOff: { color: colors.textFaint },
});
