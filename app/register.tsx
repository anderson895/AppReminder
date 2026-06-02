import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  TextInput,
  HelperText,
  Checkbox,
  Portal,
  Dialog,
  Button,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';

import { spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { TERMS_TEXT } from '../src/content/terms';

export default function Register() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [secure, setSecure] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (): Promise<void> => {
    setError('');
    if (!name.trim() || !email.trim() || !password) {
      setError('Please complete all fields.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreed) {
      setError('Please read and agree to the Terms and Conditions.');
      return;
    }
    setBusy(true);
    try {
      const res = await register({ name, email, password });
      if (res.ok) {
        // New accounts always go through the monitoring-permission flow next.
        router.replace('/permission');
      } else if (res.reason === 'exists') {
        setError('An account with that email already exists.');
      } else {
        setError('Could not create account. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>create your account</Text>
          <Text style={styles.subtitle}>
            we need an account so your bet-free progress and daily logs stay tied to
            you.
          </Text>

          <TextInput {...inputProps} label="full name" value={name} onChangeText={setName} />
          <TextInput
            {...inputProps}
            label="email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            {...inputProps}
            label="password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={secure}
            right={
              <TextInput.Icon
                icon={secure ? 'eye' : 'eye-off'}
                onPress={() => setSecure((s) => !s)}
                color={colors.textMuted}
              />
            }
          />
          <TextInput
            {...inputProps}
            label="confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={secure}
          />

          {/* Terms & Conditions agreement */}
          <View style={styles.termsRow}>
            <Checkbox
              status={agreed ? 'checked' : 'unchecked'}
              onPress={() => setAgreed((a) => !a)}
              color={colors.teal}
              uncheckedColor={colors.textMuted}
            />
            <Text style={styles.termsText}>
              I have read and agree to the{' '}
              <Text style={styles.link} onPress={() => setTermsVisible(true)}>
                Terms and Conditions
              </Text>
              .
            </Text>
          </View>

          {!!error && (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          )}

          <PrimaryButton
            label={busy ? 'creating…' : 'create account'}
            onPress={onSubmit}
            disabled={busy || !agreed}
            style={styles.cta}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>already have one? </Text>
            <Link href="/login" style={styles.link}>
              log in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Dialog
          visible={termsVisible}
          onDismiss={() => setTermsVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Terms and Conditions</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView contentContainerStyle={{ paddingVertical: spacing(1) }}>
              <Text style={styles.termsBody}>{TERMS_TEXT}</Text>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button
              textColor={colors.textMuted}
              onPress={() => setTermsVisible(false)}
            >
              close
            </Button>
            <Button
              textColor={colors.teal}
              onPress={() => {
                setAgreed(true);
                setTermsVisible(false);
              }}
            >
              I agree
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing(3) },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing(1),
    marginBottom: spacing(3),
    lineHeight: 20,
  },
  input: { marginBottom: spacing(1.5), backgroundColor: colors.surface },
  cta: { marginTop: spacing(1) },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing(3) },
  footerText: { color: colors.textMuted },
  link: { color: colors.teal, fontWeight: '700' },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing(0.5),
    marginBottom: spacing(1),
    paddingRight: spacing(1),
  },
  termsText: { color: colors.textMuted, fontSize: 13, flex: 1, lineHeight: 18 },
  dialog: { backgroundColor: colors.surface, maxHeight: '80%', borderRadius: 6 },
  dialogTitle: { color: colors.text, fontSize: 18 },
  dialogScroll: { borderColor: colors.outline },
  termsBody: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
});

