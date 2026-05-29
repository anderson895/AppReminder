import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, IconButton, Snackbar, Portal, Dialog, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings, updateSettings, clearUserLogs } from '../src/db/database';

const STEPS: readonly number[] = [5, 10, 15, 30, 60];

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [member, setMember] = useState('');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(10);
  const [amount, setAmount] = useState('400');
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState('');

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

  const onClearLogs = async () => {
    await clearUserLogs(user.id);
    setConfirmClear(false);
    setToast('History logs cleared.');
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

        {/* Danger zone */}
        <Text style={styles.dangerLabel}>danger zone</Text>
        <View style={styles.dangerCard}>
          <Text style={styles.dangerDesc}>
            Permanently delete all your daily logs and activity events. Your account and
            settings stay. This cannot be undone.
          </Text>
          <Pressable
            style={styles.dangerBtn}
            onPress={() => setConfirmClear(true)}
            android_ripple={{ color: 'rgba(242,84,91,0.18)', borderless: false }}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={18}
              color={colors.danger}
            />
            <Text style={styles.dangerBtnText}>clear history logs</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Warning before clearing logs */}
      <Portal>
        <Dialog
          visible={confirmClear}
          onDismiss={() => setConfirmClear(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Clear history logs?</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              This will permanently delete all your daily logs and every recorded
              activity event. Your bet-free streak and counts will reset to zero.
              {'\n\n'}This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={colors.textMuted} onPress={() => setConfirmClear(false)}>
              cancel
            </Button>
            <Button textColor={colors.danger} onPress={onClearLogs}>
              delete logs
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={saved}
        onDismiss={() => setSaved(false)}
        duration={2000}
        style={{ backgroundColor: colors.tealDark }}
      >
        Settings saved.
      </Snackbar>
      <Snackbar
        visible={!!toast}
        onDismiss={() => setToast('')}
        duration={2500}
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
  dangerLabel: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing(3),
    marginBottom: spacing(1),
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing(2),
  },
  dangerDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1),
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: spacing(1.5),
    marginTop: spacing(1.5),
    overflow: 'hidden',
  },
  dangerBtnText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  dialog: { backgroundColor: colors.surface, borderRadius: 6 },
  dialogTitle: { color: colors.text, fontSize: 18 },
  dialogText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
