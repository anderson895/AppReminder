import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { parsePhotos, randomPhoto } from '../src/photos';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings, recordEvent } from '../src/db/database';
import type { Category, UserSettings } from '../src/types';

function first(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default function Reminder() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ app?: string; category?: string }>();
  const appName = first(params.app, 'GCash');
  const category = first(params.category, 'financial') as Category;
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) getSettings(user.id).then(setSettings);
  }, [user]);

  if (!user) return <Redirect href="/login" />;

  const member = settings?.family_member || 'mama';
  const message =
    settings?.family_message ||
    'Anak, we believe in you. Every day you choose us over gambling, you give us our future back.';
  // Pick a random motivation photo once, when settings load.
  const photo = useMemo(
    () => randomPhoto(parsePhotos(settings?.motivation_photo)),
    [settings?.motivation_photo]
  );

  const onResist = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await recordEvent({ userId: user.id, appName, category, action: 'resisted' });
    router.back();
  };

  const onContinue = () => {
    router.replace({
      pathname: '/countdown',
      params: { app: appName, category },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bar}>
        <Text style={styles.brand}>BetFree</Text>
        <Text style={styles.clock}>9:42</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.heading}>Before You Continue…</Text>
        <Text style={styles.context}>
          you're opening <Text style={styles.appName}>{appName}</Text>
        </Text>

        {/* Motivation photo card — the user's uploaded photo, or a placeholder */}
        <View style={styles.photoCard}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" />
          ) : (
            <>
              <MaterialCommunityIcons name="account-group" size={56} color={colors.teal} />
              <Text style={styles.photoLabel}>Your motivation photo</Text>
            </>
          )}
        </View>

        {/* Message card */}
        <View style={styles.messageCard}>
          <Text style={styles.from}>From {member}</Text>
          <Text style={styles.message}>&ldquo;{message}&rdquo;</Text>
        </View>

        <PrimaryButton
          label="I don't need to open this"
          onPress={onResist}
          disabled={busy}
          style={{ marginTop: spacing(3) }}
        />
        <OutlineButton
          label="I have a real reason — continue"
          onPress={onContinue}
          style={{ marginTop: spacing(1.5) }}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
  },
  brand: { color: colors.text, fontSize: 16, fontWeight: '800' },
  clock: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: spacing(2.5), paddingTop: spacing(1) },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
  context: { color: colors.textMuted, fontSize: 14, marginTop: spacing(0.5) },
  appName: { color: colors.teal, fontWeight: '700' },
  photoCard: {
    backgroundColor: colors.tealDark,
    borderRadius: radius.md,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing(2.5),
  },
  photoLabel: { color: colors.text, marginTop: spacing(1), fontSize: 14 },
  photo: { width: '100%', height: '100%', borderRadius: radius.md },
  messageCard: {
    backgroundColor: colors.tealDark,
    borderRadius: radius.md,
    padding: spacing(2.5),
    marginTop: spacing(2),
  },
  from: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing(1),
  },
  message: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 26 },
});
