import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
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
import { getInstalledApps, detectionAvailable, type InstalledApp } from '../src/native/detector';
import type { Category } from '../src/types';

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

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
  const [error, setError] = useState('');

  useEffect(() => {
    setApps(getInstalledApps());
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

  const pick = (app: InstalledApp) => {
    setName(app.label);
    setPkg(app.packageName);
    setError('');
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
        <Text style={styles.title}>{editingId ? 'edit trigger app' : 'add trigger app'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.packageName}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
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
                style={{ marginTop: spacing(2) }}
              />

              <Text style={styles.pickLabel}>
                or pick an installed app{!detectionAvailable ? ' (preview build only)' : ''}
              </Text>
              <TextInput
                {...inputProps}
                label="search apps"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                left={<TextInput.Icon icon="magnify" />}
              />
              {detectionAvailable && apps.length === 0 && (
                <Text style={styles.empty}>No apps found.</Text>
              )}
              {!detectionAvailable && (
                <Text style={styles.empty}>
                  The installed-app list only works in the built app, not Expo Go.
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const selected = item.packageName === pkg;
            return (
              <Pressable
                onPress={() => pick(item)}
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
          }}
        />
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
  listContent: { padding: spacing(2), paddingBottom: spacing(5) },
  input: { backgroundColor: colors.surface, marginBottom: spacing(1) },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing(1),
    marginBottom: spacing(0.75),
  },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing(1) },
  pickLabel: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing(3),
    marginBottom: spacing(1),
  },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: spacing(1) },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing(1.5),
    marginTop: spacing(1),
    overflow: 'hidden',
  },
  appRowSelected: { borderWidth: 1.5, borderColor: colors.teal },
  appLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  appPkg: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
});
