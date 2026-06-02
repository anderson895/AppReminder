import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  IconButton,
  Switch,
  Portal,
  Dialog,
  Button,
  Snackbar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton, StatTile } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  getTriggerApps,
  deleteTriggerApp,
  toggleTriggerApp,
  getAdminStats,
  getPendingSuggestions,
  approveSuggestion,
  rejectSuggestion,
} from '../src/db/database';
import type { TriggerApp, AdminStats, SuggestionWithUser } from '../src/types';

export default function Admin() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { admin, logout } = useAuth();

  const [apps, setApps] = useState<TriggerApp[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<SuggestionWithUser[]>([]);

  // Delete confirm + toast
  const [toDelete, setToDelete] = useState<TriggerApp | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    getTriggerApps().then(setApps);
    getAdminStats().then(setStats);
    getPendingSuggestions().then(setPending);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!admin) return <Redirect href="/login" />;

  const openAdd = () => router.push('/trigger-edit');

  const openEdit = (app: TriggerApp) =>
    router.push({
      pathname: '/trigger-edit',
      params: {
        id: String(app.id),
        name: app.app_name,
        pkg: app.package_name,
        category: app.category,
      },
    });

  const onConfirmDelete = async () => {
    if (toDelete) {
      await deleteTriggerApp(toDelete.id);
      setToast('App removed.');
      setToDelete(null);
      load();
    }
  };

  const onToggle = async (app: TriggerApp) => {
    await toggleTriggerApp(app.id, !app.enabled);
    load();
  };

  const onApprove = async (s: SuggestionWithUser) => {
    await approveSuggestion(s.id);
    setToast(`Added ${s.app_name} to the blocked list.`);
    load();
  };

  const onReject = async (s: SuggestionWithUser) => {
    await rejectSuggestion(s.id);
    setToast('Suggestion rejected.');
    load();
  };

  const onLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>BettrMind · admin</Text>
          <Text style={styles.sub}>{admin.email}</Text>
        </View>
        <IconButton
          icon="logout"
          size={22}
          iconColor={colors.textMuted}
          onPress={onLogout}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Overview */}
        <View style={styles.tileRow}>
          <StatTile
            value={stats ? stats.totalUsers : 0}
            label="Users"
            style={{ marginRight: spacing(0.75) }}
          />
          <StatTile
            value={stats ? stats.triggerAppCount : 0}
            label="Trigger Apps"
            style={{ marginHorizontal: spacing(0.75) }}
          />
          <StatTile
            value={stats ? stats.totalGamblingAttempts : 0}
            label="Gambling Hits"
            style={{ marginLeft: spacing(0.75) }}
          />
        </View>

        {/* Pending user suggestions awaiting review */}
        {pending.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: spacing(2) }]}>
              Pending Suggestions ({pending.length})
            </Text>
            {pending.map((s) => (
              <View key={s.id} style={styles.suggestRow}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        s.category === 'gambling' ? colors.danger : colors.teal,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.appName}>{s.app_name}</Text>
                  <Text style={styles.appCat}>
                    {s.category}
                    {s.package_name ? ` · ${s.package_name}` : ''} · by {s.user_name}
                  </Text>
                </View>
                <IconButton
                  icon="check-circle"
                  size={24}
                  iconColor={colors.success}
                  onPress={() => onApprove(s)}
                />
                <IconButton
                  icon="close-circle"
                  size={24}
                  iconColor={colors.danger}
                  onPress={() => onReject(s)}
                />
              </View>
            ))}
          </>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.section}>Trigger Apps</Text>
          <PrimaryButton label="+ Add App" onPress={openAdd} style={styles.addBtn} />
        </View>
        <Text style={styles.hint}>
          This master list applies to every user. Toggle to enable/disable, tap a row to
          edit.
        </Text>

        {apps.length === 0 && (
          <Text style={styles.empty}>No trigger apps yet. Add one above.</Text>
        )}

        {apps.map((app) => (
          <View key={app.id} style={styles.row}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    app.category === 'gambling' ? colors.danger : colors.teal,
                },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>{app.app_name}</Text>
              <Text style={styles.appCat}>
                {app.category}
                {app.package_name ? ` · ${app.package_name}` : ' · no package'}
              </Text>
            </View>
            <IconButton
              icon="pencil-outline"
              size={20}
              iconColor={colors.textMuted}
              onPress={() => openEdit(app)}
            />
            <IconButton
              icon="trash-can-outline"
              size={20}
              iconColor={colors.danger}
              onPress={() => setToDelete(app)}
            />
            <Switch
              value={!!app.enabled}
              onValueChange={() => onToggle(app)}
              color={colors.teal}
            />
          </View>
        ))}
      </ScrollView>

      {/* Delete confirm */}
      <Portal>
        <Dialog
          visible={!!toDelete}
          onDismiss={() => setToDelete(null)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Remove app?</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.confirmText}>
              Remove <Text style={{ color: colors.text, fontWeight: '700' }}>
                {toDelete?.app_name}
              </Text>{' '}
              from the monitored list? This affects all users.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={colors.textMuted} onPress={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button textColor={colors.danger} onPress={onConfirmDelete}>
              Remove
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!toast}
        onDismiss={() => setToast('')}
        duration={1800}
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
    paddingLeft: spacing(2.5),
    paddingRight: spacing(1),
    paddingTop: spacing(1),
  },
  brand: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  content: { padding: spacing(2), paddingBottom: spacing(5) },
  tileRow: { flexDirection: 'row', marginBottom: spacing(1) },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing(2),
  },
  section: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addBtn: { paddingHorizontal: spacing(2), paddingVertical: spacing(1) },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing(0.5),
    marginBottom: spacing(1.5),
  },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: spacing(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingLeft: spacing(2),
    marginBottom: spacing(1),
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingLeft: spacing(2),
    marginBottom: spacing(1),
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing(1.5) },
  appName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  appCat: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  dialog: { backgroundColor: colors.surface, borderRadius: 6 },
  dialogTitle: { color: colors.text, fontSize: 18 },
  input: { backgroundColor: colors.background, marginBottom: spacing(1.5) },
  fieldLabel: { color: colors.textMuted, fontSize: 12, marginBottom: spacing(0.75) },
  hintSmall: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: -spacing(0.5),
    marginBottom: spacing(1.5),
  },
  formError: { color: colors.danger, fontSize: 12, marginTop: spacing(1) },
  confirmText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
