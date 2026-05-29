import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, TextInput, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getEnabledTriggerApps, recordAppOpen } from '../src/db/database';
import type { TriggerApp } from '../src/types';

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
  const [apps, setApps] = useState<TriggerApp[]>([]);
  const [otherApp, setOtherApp] = useState('');
  const [toast, setToast] = useState('');

  useFocusEffect(
    useCallback(() => {
      getEnabledTriggerApps().then(setApps);
    }, [])
  );

  if (!user) return <Redirect href="/login" />;

  const onLogOtherApp = async () => {
    const name = otherApp.trim();
    if (!name) return;

    // Mimic the real detector: if the opened app matches a monitored app,
    // treat it as a trigger (show the reminder); otherwise log it as 'other'.
    const match = apps.find(
      (a) => a.app_name.toLowerCase() === name.toLowerCase()
    );
    setOtherApp('');
    if (match) {
      router.push({
        pathname: '/reminder',
        params: { app: match.app_name, category: match.category },
      });
      return;
    }
    await recordAppOpen(user.id, name, 'other');
    setToast(`Logged "${name}" as opened.`);
  };

  const onSimulate = (app: TriggerApp) => {
    router.push({
      pathname: '/reminder',
      params: { app: app.app_name, category: app.category },
    });
  };

  const gambling = apps.filter((a) => a.category === 'gambling');
  const financial = apps.filter((a) => a.category === 'financial');

  const Section = ({ title, data }: { title: string; data: TriggerApp[] }) => {
    if (data.length === 0) return null;
    return (
      <>
        <Text style={styles.section}>{title}</Text>
        {data.map((app) => (
          <View key={app.id} style={styles.row}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons
                name={ICONS[app.app_name] ?? 'cellphone'}
                size={22}
                color={colors.teal}
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
              android_ripple={{ color: 'rgba(47,227,168,0.25)', borderless: false }}
              accessibilityRole="button"
              style={styles.testBtn}
            >
              <Text style={styles.testLabel}>test</Text>
            </Pressable>
          </View>
        ))}
      </>
    );
  };

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
          These are the apps SafeWallet watches, set by your administrator. Tap{' '}
          <Text style={styles.noteHi}>test</Text> to preview the reminder that appears
          when one is opened.
        </Text>
        {apps.length === 0 && (
          <Text style={styles.empty}>
            No monitored apps configured yet. Please check back later.
          </Text>
        )}
        <Section title="gambling" data={gambling} />
        <Section title="financial" data={financial} />

        {/* Simulate opening an app NOT on the monitored list */}
        <Text style={styles.section}>simulate opening an app</Text>
        <Text style={styles.note}>
          Enter any app name to simulate opening it. If it matches a monitored app
          (e.g. Maya, eBingo), the reminder appears; otherwise it's logged as “other”.
        </Text>
        <TextInput
          mode="outlined"
          label="app name (e.g. Messenger)"
          value={otherApp}
          onChangeText={setOtherApp}
          outlineColor={colors.outline}
          activeOutlineColor={colors.teal}
          textColor={colors.text}
          style={styles.otherInput}
        />
        <OutlineButton label="log app open" onPress={onLogOtherApp} />
      </ScrollView>

      <Snackbar
        visible={!!toast}
        onDismiss={() => setToast('')}
        duration={2200}
        style={{ backgroundColor: colors.tealDark }}
      >
        {toast}
      </Snackbar>
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
  empty: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
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
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.75),
    overflow: 'hidden',
  },
  testLabel: { color: colors.teal, fontWeight: '700', fontSize: 13 },
  otherInput: { backgroundColor: colors.surface, marginBottom: spacing(1.5) },
});
