import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, IconButton, Snackbar, Portal, Dialog, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { radius, spacing, type Palette, type ThemeMode } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { parsePhotos, serializePhotos } from '../src/photos';
import { PrimaryButton, OutlineButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings, updateSettings, clearUserLogs } from '../src/db/database';
import {
  detectionAvailable,
  getMutedApps,
  unmuteApp,
  type MutedApp,
} from '../src/native/detector';

const THEMES: ReadonlyArray<{ mode: ThemeMode; label: string }> = [
  { mode: 'navy', label: 'Navy' },
  { mode: 'purple', label: 'Purple' },
];

const STEPS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '15 min', seconds: 15 * 60 },
  { label: '30 min', seconds: 30 * 60 },
];

// Flip to `true` to expose the "clear history logs" danger zone again.
const SHOW_CLEAR_LOGS = false;

export default function Settings() {
  const router = useRouter();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, logout } = useAuth();
  const [member, setMember] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(15 * 60);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState<MutedApp[]>([]);

  useEffect(() => {
    if (user)
      getSettings(user.id).then((s) => {
        setMember(s.family_member);
        setMessage(s.family_message);
        setPhotos(parsePhotos(s.motivation_photo));
        setCountdown(s.countdown_seconds);
      });
    if (detectionAvailable) setMuted(getMutedApps());
  }, [user]);

  if (!user) return <Redirect href="/login" />;

  const onUnmute = (app: MutedApp): void => {
    unmuteApp(app.packageName);
    setMuted(getMutedApps());
    setToast(`${app.appName} reminders re-enabled.`);
  };

  const addPhotos = async (): Promise<void> => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.7,
    });
    if (!res.canceled) {
      const picked = res.assets.map((a) => a.uri);
      setPhotos((prev) => Array.from(new Set([...prev, ...picked])).slice(0, 6));
    }
  };

  const removePhoto = (uri: string) =>
    setPhotos((prev) => prev.filter((u) => u !== uri));

  const onSave = async (): Promise<void> => {
    await updateSettings(user.id, {
      family_member: member.trim() || 'mama',
      family_message: message.trim(),
      countdown_seconds: countdown,
      motivation_photo: serializePhotos(photos),
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
        <Text style={styles.title}>Settings</Text>
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

        <Text style={styles.section}>Appearance</Text>
        <Text style={styles.help}>Pick the color theme for the app.</Text>
        <View style={styles.stepRow}>
          {THEMES.map((t) => (
            <Text
              key={t.mode}
              onPress={() => setMode(t.mode)}
              style={[styles.chip, mode === t.mode && styles.chipActive]}
            >
              {t.label}
            </Text>
          ))}
        </View>

        <Text style={styles.section}>Reminder Message</Text>
        <Text style={styles.help}>
          Shown on the friction pop-up before a monitored app opens.
        </Text>
        <TextInput
          {...inputProps}
          label="From (e.g. Mama)"
          value={member}
          onChangeText={setMember}
        />
        <TextInput
          {...inputProps}
          label="Their message to you"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.section}>Motivation Photos</Text>
        <Text style={styles.help}>
          One of these shows at random on the pop-up. Add up to 6.
        </Text>
        <View style={styles.grid}>
          {photos.map((uri) => (
            <View key={uri} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
              <Pressable
                style={styles.removeBtn}
                onPress={() => removePhoto(uri)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="close" size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
          {photos.length < 6 && (
            <Pressable
              style={styles.addTile}
              onPress={addPhotos}
              android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="image-plus" size={28} color={colors.teal} />
              <Text style={styles.addHint}>Add Photo</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.section}>Pause Length</Text>
        <Text style={styles.help}>How long you wait before access is granted.</Text>
        <View style={styles.stepRow}>
          {STEPS.map((s) => (
            <Text
              key={s.seconds}
              onPress={() => setCountdown(s.seconds)}
              style={[styles.chip, countdown === s.seconds && styles.chipActive]}
            >
              {s.label}
            </Text>
          ))}
        </View>

        {detectionAvailable && (
          <>
            <Text style={styles.section}>Muted Apps</Text>
            <Text style={styles.help}>
              Apps you silenced with "Don't show again". Re-enable to bring back their
              reminder pop-up.
            </Text>
            {muted.length === 0 ? (
              <Text style={styles.mutedEmpty}>No muted apps.</Text>
            ) : (
              <View style={styles.mutedCard}>
                {muted.map((app, i) => (
                  <View
                    key={app.packageName}
                    style={[styles.mutedRow, i > 0 && styles.mutedDivider]}
                  >
                    <View style={styles.mutedInfo}>
                      <Text style={styles.mutedName} numberOfLines={1}>
                        {app.appName}
                      </Text>
                      <Text style={styles.mutedPkg} numberOfLines={1}>
                        {app.packageName}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.unmuteBtn}
                      onPress={() => onUnmute(app)}
                      android_ripple={{ color: 'rgba(255,255,255,0.08)', borderless: false }}
                      accessibilityRole="button"
                    >
                      <MaterialCommunityIcons name="bell-ring-outline" size={16} color={colors.teal} />
                      <Text style={styles.unmuteText}>Re-enable</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <PrimaryButton
          label="Save Changes"
          onPress={onSave}
          style={{ marginTop: spacing(2.5) }}
        />
        <OutlineButton
          label="Log Out"
          onPress={onLogout}
          style={{ marginTop: spacing(1.5) }}
        />

        {/* Danger zone */}
        {SHOW_CLEAR_LOGS && (
          <>
            <Text style={styles.dangerLabel}>danger zone</Text>
            <View style={styles.dangerCard}>
              <Text style={styles.dangerDesc}>
                Permanently delete all your daily logs and activity events. Your account
                and settings stay. This cannot be undone.
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
          </>
        )}
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
        style={{ backgroundColor: colors.surfaceAlt }}
      >
        <Text style={{ color: colors.text, fontWeight: '600' }}>Settings saved.</Text>
      </Snackbar>
      <Snackbar
        visible={!!toast}
        onDismiss={() => setToast('')}
        duration={2500}
        style={{ backgroundColor: colors.surfaceAlt }}
      >
        <Text style={{ color: colors.text, fontWeight: '600' }}>{toast}</Text>
      </Snackbar>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), marginTop: spacing(0.5) },
  thumbWrap: { width: 84, height: 84 },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.outline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(0.25),
  },
  addHint: { color: colors.textMuted, fontSize: 10 },
  mutedEmpty: { color: colors.textMuted, fontSize: 13, marginTop: spacing(0.5) },
  mutedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginTop: spacing(0.5),
    overflow: 'hidden',
  },
  mutedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing(1.5),
    gap: spacing(1),
  },
  mutedDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outline },
  mutedInfo: { flex: 1 },
  mutedName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  mutedPkg: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  unmuteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.5),
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.75),
    overflow: 'hidden',
  },
  unmuteText: {
    color: colors.teal,
    fontWeight: '700',
    fontSize: 13,
    includeFontPadding: false,
  },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) },
  chip: {
    color: colors.textMuted,
    borderWidth: 1.5,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
    overflow: 'hidden',
    fontWeight: '700',
    fontSize: 14,
    minWidth: 92,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false, // remove Android's extra space below the text
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
