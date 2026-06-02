import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput, IconButton, SegmentedButtons, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';

import { radius, spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { addSuggestion, getUserSuggestions } from '../src/db/database';
import type { AppSuggestion, Category, SuggestionStatus } from '../src/types';

const STATUS_META: Record<
  SuggestionStatus,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }
> = {
  pending: { icon: 'clock-outline', label: 'pending review' },
  approved: { icon: 'check-circle', label: 'approved' },
  rejected: { icon: 'close-circle', label: 'rejected' },
};

export default function SuggestApp() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [pkg, setPkg] = useState('');
  const [category, setCategory] = useState<Category>('gambling');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mine, setMine] = useState<AppSuggestion[]>([]);

  const load = useCallback(() => {
    if (user) getUserSuggestions(user.id).then(setMine);
  }, [user]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (!user) return <Redirect href="/login" />;

  const statusColor = (s: SuggestionStatus): string =>
    s === 'approved' ? colors.success : s === 'rejected' ? colors.danger : colors.textMuted;

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Please enter the app name.');
      return;
    }
    setError('');
    await addSuggestion(user.id, name.trim(), category, pkg.trim());
    setName('');
    setPkg('');
    setToast('Suggestion sent for admin review.');
    load();
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
        <IconButton icon="arrow-left" size={22} iconColor={colors.text} onPress={() => router.back()} />
        <Text style={styles.title}>suggest an app</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.help}>
            Know a gambling or e-wallet app that should be blocked? Suggest it here —
            an admin reviews each one before it's added to the blocked list for everyone.
          </Text>

          <TextInput {...inputProps} label="app name" value={name} onChangeText={setName} />
          <TextInput
            {...inputProps}
            label="package name (optional)"
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

          <PrimaryButton label="submit suggestion" onPress={submit} style={{ marginTop: spacing(2) }} />

          {mine.length > 0 && (
            <>
              <Text style={styles.section}>your suggestions</Text>
              {mine.map((s) => {
                const meta = STATUS_META[s.status];
                return (
                  <View key={s.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{s.app_name}</Text>
                      <Text style={styles.rowCat}>{s.category}</Text>
                    </View>
                    <MaterialCommunityIcons name={meta.icon} size={16} color={statusColor(s.status)} />
                    <Text style={[styles.rowStatus, { color: statusColor(s.status) }]}>
                      {meta.label}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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
    content: { padding: spacing(2), paddingBottom: spacing(5) },
    help: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing(1.5) },
    input: { backgroundColor: colors.surface, marginBottom: spacing(1) },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: spacing(0.5),
      marginBottom: spacing(0.75),
    },
    error: { color: colors.danger, fontSize: 12, marginTop: spacing(1) },
    section: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: spacing(3),
      marginBottom: spacing(1),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(1),
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: spacing(1.5),
      marginBottom: spacing(0.75),
    },
    rowName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    rowCat: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    rowStatus: { fontSize: 12, fontWeight: '700' },
  });
