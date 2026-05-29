import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { PrimaryButton, OutlineButton, StatTile } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getStats } from '../src/db/database';
import type { Stats } from '../src/types';

function peso(n: number): string {
  return '₱ ' + Number(n || 0).toLocaleString('en-PH');
}

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (user) {
        getStats(user.id).then((s) => {
          if (active) setStats(s);
        });
      }
      return () => {
        active = false;
      };
    }, [user])
  );

  if (!user) return <Redirect href="/login" />;

  const openEWallet = () =>
    router.push({
      pathname: '/reminder',
      params: { app: 'GCash', category: 'financial' },
    });

  const firstName = (user.name || '').split(' ')[0] || 'friend';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Branded header */}
      <View style={styles.header}>
        <Text style={styles.brand}>SafeWallet</Text>
        <View style={styles.headerRight}>
          <IconButton
            icon="cog-outline"
            size={22}
            iconColor={colors.textMuted}
            onPress={() => router.push('/settings')}
            style={styles.gear}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Bet-free streak hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>bet-free streak</Text>
          <Text style={styles.heroNumber}>{stats ? stats.streakDays : '—'}</Text>
          <Text style={styles.heroSub}>days strong</Text>

          {/* White money card */}
          <View style={styles.moneyCard}>
            <Text style={styles.moneyLabel}>money not gambled</Text>
            <Text style={styles.moneyValue}>
              {peso(stats ? stats.moneyNotGambled : 0)}
            </Text>
          </View>

          {/* Stat tiles */}
          <View style={styles.tileRow}>
            <StatTile
              value={stats ? stats.urgesResisted : 0}
              label="urges resisted"
              style={{ marginRight: spacing(1) }}
            />
            <StatTile
              value={stats ? `${stats.longestStreakWeeks} wks` : '0 wks'}
              label="longest streak"
              style={{ marginLeft: spacing(1) }}
            />
          </View>

          {/* Actions */}
          <PrimaryButton
            label="open e-wallet"
            onPress={openEWallet}
            style={{ marginTop: spacing(2.5) }}
          />
          <OutlineButton
            label="view journal"
            onPress={() => router.push('/journal')}
            style={{ marginTop: spacing(1.5) }}
          />
        </View>

        {/* Detection simulator (stands in for the native background monitor) */}
        <Pressable style={styles.simRow} onPress={() => router.push('/apps')}>
          <Text style={styles.simText}>monitored apps — tap to test detection</Text>
          <IconButton icon="chevron-right" size={20} iconColor={colors.textMuted} />
        </Pressable>

        <Text style={styles.greeting}>stay strong, {firstName}.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  gear: { margin: 0 },
  content: { padding: spacing(2), paddingBottom: spacing(4) },
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
  moneyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(2),
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: spacing(2.5),
  },
  moneyLabel: { color: colors.teal, fontSize: 14, fontWeight: '600' },
  moneyValue: {
    color: colors.tealDark,
    fontSize: 28,
    fontWeight: '800',
    marginTop: spacing(0.5),
  },
  tileRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing(1.5) },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingLeft: spacing(2),
    marginTop: spacing(2),
  },
  simText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  greeting: {
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing(3),
    fontSize: 13,
  },
});
