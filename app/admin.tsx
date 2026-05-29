import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  IconButton,
  Switch,
  Portal,
  Dialog,
  TextInput,
  Button,
  SegmentedButtons,
  Snackbar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { OutlineButton, PrimaryButton, StatTile } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import {
  getTriggerApps,
  addTriggerApp,
  updateTriggerApp,
  deleteTriggerApp,
  toggleTriggerApp,
  getAdminStats,
} from '../src/db/database';
import type { TriggerApp, AdminStats, Category } from '../src/types';

export default function Admin() {
  const router = useRouter();
  const { admin, logout } = useAuth();

  const [apps, setApps] = useState<TriggerApp[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Add/edit dialog state
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<TriggerApp | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('gambling');
  const [formError, setFormError] = useState('');

  // Delete confirm + toast
  const [toDelete, setToDelete] = useState<TriggerApp | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    getTriggerApps().then(setApps);
    getAdminStats().then(setStats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!admin) return <Redirect href="/login" />;

  const openAdd = () => {
    setEditing(null);
    setName('');
    setCategory('gambling');
    setFormError('');
    setFormVisible(true);
  };

  const openEdit = (app: TriggerApp) => {
    setEditing(app);
    setName(app.app_name);
    setCategory(app.category);
    setFormError('');
    setFormVisible(true);
  };

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Please enter an app name.');
      return;
    }
    if (editing) {
      await updateTriggerApp(editing.id, trimmed, category);
      setToast('App updated.');
    } else {
      await addTriggerApp(trimmed, category);
      setToast('App added.');
    }
    setFormVisible(false);
    load();
  };

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

  const onLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>SafeWallet · admin</Text>
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
            label="users"
            style={{ marginRight: spacing(0.75) }}
          />
          <StatTile
            value={stats ? stats.triggerAppCount : 0}
            label="trigger apps"
            style={{ marginHorizontal: spacing(0.75) }}
          />
          <StatTile
            value={stats ? stats.totalGamblingAttempts : 0}
            label="gambling hits"
            style={{ marginLeft: spacing(0.75) }}
          />
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>trigger apps</Text>
          <PrimaryButton label="+ add app" onPress={openAdd} style={styles.addBtn} />
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
              <Text style={styles.appCat}>{app.category}</Text>
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

      {/* Add / edit dialog */}
      <Portal>
        <Dialog
          visible={formVisible}
          onDismiss={() => setFormVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>
            {editing ? 'Edit trigger app' : 'Add trigger app'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="app name"
              value={name}
              onChangeText={setName}
              outlineColor={colors.outline}
              activeOutlineColor={colors.teal}
              textColor={colors.text}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>category</Text>
            <SegmentedButtons
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
              buttons={[
                { value: 'gambling', label: 'gambling' },
                { value: 'financial', label: 'financial' },
              ]}
            />
            {!!formError && <Text style={styles.formError}>{formError}</Text>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button textColor={colors.textMuted} onPress={() => setFormVisible(false)}>
              cancel
            </Button>
            <Button textColor={colors.teal} onPress={onSave}>
              {editing ? 'save' : 'add'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete confirm */}
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
              cancel
            </Button>
            <Button textColor={colors.danger} onPress={onConfirmDelete}>
              remove
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!toast}
        onDismiss={() => setToast('')}
        duration={1800}
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
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing(1.5) },
  appName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  appCat: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  dialog: { backgroundColor: colors.surface, borderRadius: 6 },
  dialogTitle: { color: colors.text, fontSize: 18 },
  input: { backgroundColor: colors.background, marginBottom: spacing(1.5) },
  fieldLabel: { color: colors.textMuted, fontSize: 12, marginBottom: spacing(0.75) },
  formError: { color: colors.danger, fontSize: 12, marginTop: spacing(1) },
  confirmText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
