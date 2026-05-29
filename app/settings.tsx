import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, IconButton, Snackbar } from 'react-native-paper';
import { useRouter, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings, updateSettings } from '../src/db/database';

const STEPS: readonly number[] = [5, 10, 15, 30, 60];

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [member, setMember] = useState('');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(10);
  const [amount, setAmount] = useState('400');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user)
      getSettings(user.id).then((s) => {
        setMember(s.family_member);
        setMessage(s.family_message);
        setCountdown(s.countdown_seconds);
        setAmount(String(s.avg_amount));
      });
  }, [user]);

  if (!user) return <Redirect href="/login" />;

  const onSave = async (): Promise<void> => {
    await updateSettings(user.id, {
      family_member: member.trim() || 'mama',
      family_message: message.trim(),
      countdown_seconds: countdown,
      avg_amount: Math.max(0, parseInt(amount, 10) || 0),
    });
    setSaved(true);
  };

  const onLogout = () => {
    logout();
    router.replace('/login');
  };

  const inputProps = {
    mode: 'outlined' as const,
    outlineColor: colors.outline,
    activeOutlineColor: colors.teal,
    textColor: colors.text,
    style: styles.input,
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
        <Text style={styles.title}>settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Account */}
        <View style={styles.accountCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user.name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.accName}>{user.name}</Text>
            <Text style={styles.accEmail}>{user.email}</Text>
          </View>
        </View>

        <Text style={styles.section}>reminder message</Text>
        <Text style={styles.help}>
          Shown on the friction pop-up before a monitored app opens.
        </Text>
        <TextInput
          {...inputProps}
          label="from (e.g. mama)"
          value={member}
          onChangeText={setMember}
        />
        <TextInput
          {...inputProps}
          label="their message to you"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.section}>pause length</Text>
        <Text style={styles.help}>Seconds you wait before access is granted.</Text>
        <View style={styles.stepRow}>
          {STEPS.map((s) => (
            <Text
              key={s}
              onPress={() => setCountdown(s)}
              style={[styles.chip, countdown === s && styles.chipActive]}
            >
              {s}s
            </Text>
          ))}
        </View>

        <Text style={styles.section}>typical bet amount (₱)</Text>
        <Text style={styles.help}>
          Used to estimate the "money not gambled" figure on your dashboard.
        </Text>
        <TextInput
          {...inputProps}
          label="amount per urge"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <PrimaryButton
          label="save changes"
          onPress={onSave}
          style={{ marginTop: spacing(2) }}
        />
        <OutlineButton
          label="log out"
          onPress={onLogout}
          style={{ marginTop: spacing(1.5) }}
        />
      </ScrollView>

      <Snackbar
        visible={saved}
        onDismiss={() => setSaved(false)}
        duration={2000}
        style={{ backgroundColor: colors.tealDark }}
      >
        Settings saved.
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
  content: { padding: spacing(2), paddingBottom: spacing(5) },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(2),
    marginBottom: spacing(1),
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(1.5),
  },
  avatarText: { color: colors.onTeal, fontSize: 20, fontWeight: '800' },
  accName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  accEmail: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  section: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing(2.5),
  },
  help: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing(1),
  },
  input: { backgroundColor: colors.surface, marginBottom: spacing(1) },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    color: colors.textMuted,
    borderWidth: 1.5,
    borderColor: colors.outline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.75),
    marginRight: spacing(1),
    marginBottom: spacing(1),
    overflow: 'hidden',
    fontWeight: '700',
  },
  chipActive: {
    color: colors.onTeal,
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
});
