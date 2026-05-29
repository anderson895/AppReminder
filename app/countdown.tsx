import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';

import { colors, spacing } from '../src/theme';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings, recordEvent } from '../src/db/database';
import type { Category } from '../src/types';

function first(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Countdown() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ app?: string; category?: string }>();
  const appName = first(params.app, 'GCash');
  const category = first(params.category, 'financial') as Category;

  const [seconds, setSeconds] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const recorded = useRef(false);

  // Load configured countdown length, then tick down.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    (async () => {
      const s = user ? await getSettings(user.id) : null;
      const total = s?.countdown_seconds ?? 10;
      if (cancelled) return;
      setSeconds(total);
      interval = setInterval(() => {
        setSeconds((prev) => {
          if (prev === null) return prev;
          if (prev <= 1) {
            if (interval) clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    })();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [user]);

  // When the timer reaches zero, log the (gambling-counted) proceed exactly once.
  useEffect(() => {
    if (seconds === 0 && !recorded.current && user) {
      recorded.current = true;
      recordEvent({ userId: user.id, appName, category, action: 'proceeded' }).then(
        () => setDone(true)
      );
    }
  }, [seconds, user, appName, category]);

  if (!user) return <Redirect href="/login" />;

  const onChangedMind = async (): Promise<void> => {
    if (recorded.current) return;
    recorded.current = true;
    await recordEvent({ userId: user.id, appName, category, action: 'resisted' });
    router.replace('/dashboard');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        {!done ? (
          <>
            <Text style={styles.heading}>take a breath</Text>
            <Text style={styles.sub}>
              {appName} will be available in a moment. Use this pause to be sure.
            </Text>

            <View style={styles.ring}>
              <Text style={styles.count}>
                {seconds === null ? '…' : formatTime(seconds)}
              </Text>
              <Text style={styles.countUnit}>remaining</Text>
            </View>

            <OutlineButton
              label="actually, I changed my mind"
              onPress={onChangedMind}
              style={{ alignSelf: 'stretch', marginTop: spacing(4) }}
            />
          </>
        ) : (
          <>
            <View style={styles.grantedIcon}>
              <MaterialCommunityIcons name="check" size={48} color={colors.onTeal} />
            </View>
            <Text style={styles.heading}>access granted</Text>
            <Text style={styles.sub}>
              {category === 'gambling'
                ? 'This attempt was logged under today’s activity. Spend mindfully.'
                : 'Logged. Remember what you’re saving for.'}
            </Text>

            <PrimaryButton
              label={`continue to ${appName}`}
              onPress={() => router.replace('/dashboard')}
              style={{ alignSelf: 'stretch', marginTop: spacing(4) }}
            />
            <OutlineButton
              label="back to BettrMind"
              onPress={() => router.replace('/dashboard')}
              style={{ alignSelf: 'stretch', marginTop: spacing(1.5) }}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(3),
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing(1),
    lineHeight: 20,
  },
  ring: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 6,
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing(4),
  },
  count: { color: colors.teal, fontSize: 46, fontWeight: '800', lineHeight: 54 },
  countUnit: { color: colors.textMuted, fontSize: 14 },
  grantedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(2),
  },
});
