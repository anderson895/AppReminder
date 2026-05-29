import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, IconButton, SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';

import { colors, radius, spacing } from '../src/theme';
import { PrimaryButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { addTriggerApp, updateTriggerApp } from '../src/db/database';
import {
  getInstalledApps,
  detectionAvailable,
  type InstalledApp,
} from '../src/native/detector';
import type { Category } from '../src/types';

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

// Memoized row so toggling the category (or other state) never re-renders or
// blanks out the installed-apps list.
const AppRow = React.memo(function AppRow({
  item,
  selected,
  onPick,
}: {
  item: InstalledApp;
  selected: boolean;
  onPick: (a: InstalledApp) => void;
}) {
  return (
    <Pressable
      onPress={() => onPick(item)}
      android_ripple={{ color: 'rgba(47,227,168,0.18)' }}
      style={[styles.appRow, selected && styles.appRowSelected]}
    >
      <MaterialCommunityIcons
        name={selected ? 'check-circle' : 'cellphone'}
        size={22}
        color={selected ? colors.teal : colors.textMuted}
      />
      <View style={{ flex: 1, marginLeft: spacing(1.5) }}>
        <Text style={styles.appLabel}>{item.label}</Text>
        <Text style={styles.appPkg}>{item.packageName}</Text>
      </View>
    </Pressable>
  );
});

export default function TriggerEdit() {
  const router = useRouter();
  const { admin } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    pkg?: string;
    category?: string;
  }>();

  const editingId = first(params.id) ? Number(first(params.id)) : null;
  const [name, setName] = useState(first(params.name));
  const [pkg, setPkg] = useState(first(params.pkg));
  const [category, setCategory] = useState<Category>(
    (first(params.category) as Category) || 'gambling'
  );
  const [search, setSearch] = useState('');
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load installed apps AFTER the screen transition so it shows instantly with
  // a loader instead of freezing on the (potentially slow) native call.
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
        a.label.toLowerCase().includes(q) ||
        a.packageName.toLowerCase().includes(q)
    );
  }, [apps, search]);

  const pick = useCallback((app: InstalledApp) => {
    setName(app.label);
    setPkg(app.packageName);
    setError('');
  }, []);

  if (!admin) return <Redirect href="/login" />;

  const onSave = async () => {
    if (!name.trim()) {
      setError('Please enter an app name or pick one below.');
      return;
    }
    if (editingId) {
      await updateTriggerApp(editingId, name.trim(), category, pkg.trim());
    } else {
      await addTriggerApp(name.trim(), category, pkg.trim());
    }
    router.back();
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
        <Text style={styles.title}>
          {editingId ? 'edit trigger app' : 'add trigger app'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Fixed form — kept OUT of the FlatList so toggling category never
            re-renders the list. */}
        <View style={styles.form}>
          <TextInput {...inputProps} label="app name" value={name} onChangeText={setName} />
          <TextInput
            {...inputProps}
            label="package name"
            value={pkg}
            onChangeText={setPkg}
            autoCapitalize="none"
            autoCorrect={false}
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
          {!!error && <Text style={styles.error}>{error}</Text>}

          <PrimaryButton
            label={editingId ? 'save' : 'add app'}
            onPress={onSave}
            style={{ marginTop: spacing(1.5) }}
          />

          <Text style={styles.pickLabel}>or pick an installed app</Text>
          <TextInput
            {...inputProps}
            label="search apps"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            left={<TextInput.Icon icon="magnify" />}
          />
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.teal} size="large" />
            <Text style={styles.loaderText}>loading installed apps…</Text>
          </View>
        ) : !detectionAvailable ? (
          <Text style={styles.empty}>
            The installed-app list only works in the built app, not Expo Go.
          </Text>
        ) : (
          // Plain ScrollView + map (no FlatList virtualization) so rows never
          // blank out when re-rendering.
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
                  selected={item.packageName === pkg}
                  onPick={pick}
                />
              ))
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
  form: { paddingHorizontal: spacing(2), paddingTop: spacing(1) },
  listContent: { paddingHorizontal: spacing(2), paddingBottom: spacing(5) },
  input: { backgroundColor: colors.surface, marginBottom: spacing(1) },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing(0.5),
    marginBottom: spacing(0.75),
  },
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
    // Constant border (transparent → teal) so selecting never shifts layout,
    // which on Android could clip/blank the row's text on re-render.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  appRowSelected: { borderColor: colors.teal },
  appLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  appPkg: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
});
