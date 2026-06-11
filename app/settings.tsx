import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  AppState,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  TextInput,
  IconButton,
  Snackbar,
  Portal,
  Dialog,
  Button,
  Switch,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { radius, spacing, type Palette, type ThemeMode } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { parsePhotos, serializePhotos } from '../src/photos';
import { PrimaryButton, OutlineButton, navOnce } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  getSettings,
  updateSettings,
  clearUserLogs,
  setMonitoringGranted,
  getEnabledTriggerApps,
} from '../src/db/database';
import {
  detectionAvailable,
  hasUsageAccess,
  openUsageAccessSettings,
  hasOverlayPermission,
  openOverlaySettings,
  startMonitoring,
  stopMonitoring,
  configureReminder,
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

  // Live status of every access the app needs, so the user can re-allow or
  // remove each one from here.
  const [monitoringOn, setMonitoringOn] = useState(false);
  const [usageOk, setUsageOk] = useState(!detectionAvailable);
  const [overlayOk, setOverlayOk] = useState(!detectionAvailable);
  const [notifOk, setNotifOk] = useState(true);

  useEffect(() => {
    if (user)
      getSettings(user.id).then((s) => {
        setMember(s.family_member);
        setMessage(s.family_message);
        setPhotos(parsePhotos(s.motivation_photo));
        setCountdown(s.countdown_seconds);
        setMonitoringOn(!!s.monitoring_granted);
      });
  }, [user]);

  const refreshPerms = useCallback(() => {
    if (detectionAvailable) {
      setUsageOk(hasUsageAccess());
      setOverlayOk(hasOverlayPermission());
    }
    // POST_NOTIFICATIONS is a runtime permission only on Android 13+.
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
        .then(setNotifOk)
        .catch(() => {});
    }
  }, []);

  // Re-check whenever we come back from a system-settings screen.
  useEffect(() => {
    refreshPerms();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshPerms();
    });
    return () => sub.remove();
  }, [refreshPerms]);

  const requestNotif = useCallback(async () => {
    if (Platform.OS === 'android' && (Platform.Version as number) >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }
    refreshPerms();
  }, [refreshPerms]);

  if (!user) return <Redirect href="/login" />;

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

  /** Master monitoring consent: off stops the watcher, on re-arms it. */
  const onToggleMonitoring = async (next: boolean) => {
    if (!next) {
      setMonitoringOn(false);
      await setMonitoringGranted(user.id, false);
      if (detectionAvailable) stopMonitoring();
      setToast('Monitoring turned off — reminders won’t trigger.');
      return;
    }
    // Can't monitor without the usage-access grant — run the grant flow first.
    if (detectionAvailable && !hasUsageAccess()) {
      router.push('/permission');
      return;
    }
    setMonitoringOn(true);
    await setMonitoringGranted(user.id, true);
    if (detectionAvailable) {
      const apps = await getEnabledTriggerApps();
      startMonitoring(apps);
      configureReminder(member.trim() || 'mama', message.trim(), countdown, photos);
    }
    setToast('Monitoring is on.');
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
          onPress={() => navOnce(() => router.back())}
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

        <Text style={styles.section}>Permissions</Text>
        <Text style={styles.help}>
          The access BetFree needs to detect and remind. Tap Change to allow or
          remove it in system settings.
        </Text>

        {/* Master in-app consent switch */}
        <View style={styles.permRow}>
          <MaterialCommunityIcons
            name="shield-account"
            size={20}
            color={monitoringOn ? colors.teal : colors.textMuted}
          />
          <View style={styles.permBody}>
            <Text style={styles.permName}>App monitoring</Text>
            <Text style={[styles.permState, { color: monitoringOn ? colors.success : colors.danger }]}>
              {monitoringOn ? 'on' : 'off'}
            </Text>
          </View>
          <Switch value={monitoringOn} onValueChange={onToggleMonitoring} color={colors.teal} />
        </View>

        {detectionAvailable && (
          <>
            <PermStatusRow
              icon="eye-check-outline"
              label="Usage access"
              granted={usageOk}
              onChange={openUsageAccessSettings}
            />
            <PermStatusRow
              icon="application-outline"
              label="Display over other apps"
              granted={overlayOk}
              onChange={openOverlaySettings}
            />
          </>
        )}
        {Platform.OS === 'android' && (Platform.Version as number) >= 33 && (
          <PermStatusRow
            icon="bell-outline"
            label="Notifications"
            granted={notifOk}
            onChange={requestNotif}
          />
        )}

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

/** One device-permission line: status (allowed / not allowed) + Change button. */
function PermStatusRow({
  icon,
  label,
  granted,
  onChange,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  granted: boolean;
  onChange: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.permRow}>
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={granted ? colors.teal : colors.textMuted}
      />
      <View style={styles.permBody}>
        <Text style={styles.permName}>{label}</Text>
        <Text style={[styles.permState, { color: granted ? colors.success : colors.danger }]}>
          {granted ? 'allowed' : 'not allowed'}
        </Text>
      </View>
      <Pressable
        onPress={onChange}
        android_ripple={{ color: 'rgba(47,227,168,0.25)', borderless: false }}
        style={styles.permBtn}
        accessibilityRole="button"
      >
        <Text style={styles.permBtnText}>{granted ? 'Change' : 'Allow'}</Text>
      </Pressable>
    </View>
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
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(1.75),
    marginBottom: spacing(1),
  },
  permBody: { flex: 1 },
  permName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  permState: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  permBtn: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.75),
    overflow: 'hidden',
  },
  permBtnText: { color: colors.teal, fontWeight: '700', fontSize: 13 },
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
