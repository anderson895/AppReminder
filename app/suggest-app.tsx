import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, IconButton, SegmentedButtons, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { addSuggestion, getUserSuggestions, getTriggerApps } from '../src/db/database';
import {
  getInstalledApps,
  detectionAvailable,
  type InstalledApp,
} from '../src/native/detector';
import type { AppSuggestion, Category, SuggestionStatus } from '../src/types';

const STATUS_META: Record<
  SuggestionStatus,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }
> = {
  pending: { icon: 'clock-outline', label: 'pending review' },
  approved: { icon: 'check-circle', label: 'approved' },
  rejected: { icon: 'close-circle', label: 'rejected' },
};

/** Memoized, theme-aware styles shared by AppRow + the screen. */
function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

// Memoized row (collapsable={false} keeps Android from blanking rows on a
// sibling commit when another row is selected). Apps already on the admin's
// global blocked list are shown disabled — no need to suggest them again.
const AppRow = React.memo(function AppRow({
  item,
  selected,
  blocked,
  onPick,
}: {
  item: InstalledApp;
  selected: boolean;
  blocked: boolean;
  onPick: (a: InstalledApp) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => onPick(item)}
      android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
      style={[styles.appRow, selected && styles.appRowSelected, blocked && styles.appRowBlocked]}
      collapsable={false}
      disabled={blocked}
    >
      <MaterialCommunityIcons
        name={blocked ? 'shield-check' : selected ? 'check-circle' : 'cellphone'}
        size={22}
        color={blocked ? colors.success : selected ? colors.teal : colors.textMuted}
      />
      <View style={{ flex: 1, marginLeft: spacing(1.5) }} collapsable={false}>
        <Text style={[styles.appLabel, blocked && styles.appLabelBlocked]}>{item.label}</Text>
        <Text style={styles.appPkg}>{item.packageName}</Text>
      </View>
      {blocked && <Text style={styles.blockedTag}>already blocked</Text>}
    </Pressable>
  );
});

export default function SuggestApp() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useAuth();

  const [category, setCategory] = useState<Category>('gambling');
  const [pickedName, setPickedName] = useState('');
  const [pickedPkg, setPickedPkg] = useState('');
  const [search, setSearch] = useState('');
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<AppSuggestion[]>([]);

  // Package names + app names already on the admin's global list — those are
  // disabled in the picker so users can't suggest something already blocked.
  const [blockedKeys, setBlockedKeys] = useState<Set<string>>(new Set());

  const loadMine = useCallback(() => {
    if (user) getUserSuggestions(user.id).then(setMine).catch(() => {});
    getTriggerApps()
      .then((list) => {
        const keys = new Set<string>();
        for (const t of list) {
          if (t.package_name.trim()) keys.add(t.package_name.trim().toLowerCase());
          keys.add(t.app_name.trim().toLowerCase());
        }
        setBlockedKeys(keys);
      })
      .catch(() => {});
  }, [user]);

  useFocusEffect(useCallback(() => loadMine(), [loadMine]));

  const isBlocked = useCallback(
    (a: InstalledApp) =>
      blockedKeys.has(a.packageName.trim().toLowerCase()) ||
      blockedKeys.has(a.label.trim().toLowerCase()),
    [blockedKeys]
  );

  // Load installed apps after the screen transition (with a loader).
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setApps(getInstalledApps());
      setLoading(false);
    });
    return () => task.cancel();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q)
    );
  }, [apps, search]);

  const pick = useCallback((app: InstalledApp) => {
    setPickedName(app.label);
    setPickedPkg(app.packageName);
    setError('');
  }, []);

  if (!user) return <Redirect href="/login" />;

  const statusColor = (s: SuggestionStatus): string =>
    s === 'approved' ? colors.success : s === 'rejected' ? colors.danger : colors.textMuted;

  const submit = async (): Promise<void> => {
    if (busy) return; // guard against double-taps
    if (!pickedName.trim()) {
      setError('Please select an app below first.');
      return;
    }
    if (
      blockedKeys.has(pickedName.trim().toLowerCase()) ||
      (pickedPkg.trim() && blockedKeys.has(pickedPkg.trim().toLowerCase()))
    ) {
      setError('That app is already on the blocked list.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await addSuggestion(user.id, pickedName.trim(), category, pickedPkg.trim());
      setPickedName('');
      setPickedPkg('');
      setToast('Suggestion sent for admin review.');
      loadMine();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" size={22} iconColor={colors.text} onPress={() => router.back()} />
        <Text style={styles.title}>Suggest an App</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Fixed form (kept out of the list) */}
      <View style={styles.form}>
        <Text style={styles.help}>
          Select an installed app you think should be blocked. An admin reviews it
          before it's added to the blocked list for everyone.
        </Text>

        <Text style={styles.fieldLabel}>Category</Text>
        <SegmentedButtons
          value={category}
          onValueChange={(v) => setCategory(v as Category)}
          buttons={[
            { value: 'gambling', label: 'gambling' },
            { value: 'financial', label: 'financial' },
          ]}
        />

        {/* Selected app */}
        <View style={styles.selectedBox}>
          {pickedName ? (
            <>
              <MaterialCommunityIcons name="check-circle" size={18} color={colors.teal} />
              <Text style={styles.selectedText}>
                {pickedName}
                {pickedPkg ? `  ·  ${pickedPkg}` : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.selectedNone}>no app selected yet</Text>
          )}
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton
          label={busy ? 'Submitting…' : 'Submit Suggestion'}
          onPress={submit}
          disabled={busy}
          style={{ marginTop: spacing(1.5) }}
        />

        <Text style={styles.pickLabel}>Pick an Installed App</Text>
        <TextInput
          mode="outlined"
          label="Search apps"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          outlineColor={colors.outline}
          activeOutlineColor={colors.teal}
          textColor={colors.text}
          left={<TextInput.Icon icon="magnify" />}
          style={styles.input}
        />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.loaderText}>loading installed apps…</Text>
        </View>
      ) : !detectionAvailable ? (
        <Text style={styles.empty}>
          The installed-app picker only works in the built app, not Expo Go.
        </Text>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <Text style={styles.empty}>No apps found.</Text>
          ) : (
            filtered.map((item) => (
              <AppRow
                key={item.packageName}
                item={item}
                selected={item.packageName === pickedPkg}
                blocked={isBlocked(item)}
                onPick={pick}
              />
            ))
          )}

          {mine.length > 0 && (
            <>
              <Text style={styles.section}>Your Suggestions</Text>
              {mine.map((s) => {
                const meta = STATUS_META[s.status];
                return (
                  <View key={s.id} style={styles.mineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mineName}>{s.app_name}</Text>
                      <Text style={styles.mineCat}>{s.category}</Text>
                    </View>
                    <MaterialCommunityIcons name={meta.icon} size={16} color={statusColor(s.status)} />
                    <Text style={[styles.mineStatus, { color: statusColor(s.status) }]}>
                      {meta.label}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: spacing(1),
    },
    title: { color: colors.text, fontSize: 18, fontWeight: '800' },
    form: { paddingHorizontal: spacing(2), paddingTop: spacing(0.5) },
    help: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing(1.5) },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 12,
      marginBottom: spacing(0.75),
    },
    selectedBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1),
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: spacing(1.5),
      marginTop: spacing(1.5),
    },
    selectedText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
    selectedNone: { color: colors.textFaint, fontSize: 13, fontStyle: 'italic' },
    error: { color: colors.danger, fontSize: 12, marginTop: spacing(1) },
    pickLabel: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: spacing(2.5),
      marginBottom: spacing(1),
    },
    input: { backgroundColor: colors.surface },
    listContent: { paddingHorizontal: spacing(2), paddingBottom: spacing(5) },
    loader: { paddingTop: spacing(4), alignItems: 'center', gap: spacing(1) },
    loaderText: { color: colors.textMuted, fontSize: 13 },
    empty: {
      color: colors.textMuted,
      fontSize: 13,
      paddingHorizontal: spacing(2),
      marginTop: spacing(1),
    },
    appRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: spacing(1.5),
      marginTop: spacing(1),
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    appRowSelected: { borderColor: colors.teal },
    appRowBlocked: { opacity: 0.55 },
    appLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
    appLabelBlocked: { color: colors.textMuted },
    blockedTag: {
      color: colors.success,
      fontSize: 11,
      fontWeight: '700',
      marginLeft: spacing(1),
    },
    appPkg: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
    section: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: spacing(3),
      marginBottom: spacing(1),
    },
    mineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1),
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: spacing(1.5),
      marginBottom: spacing(0.75),
    },
    mineName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    mineCat: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    mineStatus: { fontSize: 12, fontWeight: '700' },
  });
