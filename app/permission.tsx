import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { setMonitoringGranted } from '../src/db/database';

interface PermItem {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  desc: string;
}

const PERMISSIONS: PermItem[] = [
  {
    icon: 'eye-check-outline',
    title: 'Usage access',
    desc: 'Lets BettrMind see which app is currently open so it can recognise a monitored gambling or financial app.',
  },
  {
    icon: 'application-outline',
    title: 'Display over other apps',
    desc: 'Lets the reminder appear on top of the app you opened, before you continue.',
  },
];

export default function Permission() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) return <Redirect href="/login" />;

  const onAllow = async () => {
    if (busy) return;
    setBusy(true);
    // In the native dev build this is where we deep-link to Android's
    // "Usage access" / "Display over other apps" settings screens and verify
    // the grant. In Expo Go we record the user's in-app consent.
    await setMonitoringGranted(user.id, true);
    router.replace('/dashboard');
  };

  const onSkip = () => router.replace('/dashboard');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="shield-account" size={44} color={colors.onTeal} />
        </View>

        <Text style={styles.title}>enable app monitoring</Text>
        <Text style={styles.subtitle}>
          For BettrMind to remind you before you open a gambling or financial app, it
          needs permission to monitor which apps you open.
        </Text>

        {PERMISSIONS.map((p) => (
          <View key={p.title} style={styles.permCard}>
            <View style={styles.permIcon}>
              <MaterialCommunityIcons name={p.icon} size={22} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>{p.title}</Text>
              <Text style={styles.permDesc}>{p.desc}</Text>
            </View>
          </View>
        ))}

        <View style={styles.notice}>
          <MaterialCommunityIcons
            name="lock-check-outline"
            size={18}
            color={colors.textMuted}
          />
          <Text style={styles.noticeText}>
            BettrMind only checks the app you open against the monitored list. It never
            reads your messages, transactions, or balances.
          </Text>
        </View>

        <PrimaryButton
          label={busy ? 'enabling…' : 'allow monitoring'}
          onPress={onAllow}
          disabled={busy}
          style={{ marginTop: spacing(3) }}
        />
        <OutlineButton
          label="not now"
          onPress={onSkip}
          style={{ marginTop: spacing(1.5) }}
        />
        <Text style={styles.footNote}>
          You can change this anytime. Reminders won't work until monitoring is allowed.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
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
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(1),
    marginTop: spacing(1),
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  footNote: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing(2),
    lineHeight: 17,
  },
});
