import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';

import { colors, spacing } from '../src/theme';
import { PrimaryButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (): Promise<void> => {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.ok) {
        router.replace('/dashboard');
      } else if (res.reason === 'no-account') {
        setError('No account found for that email.');
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
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
          <View style={styles.brandWrap}>
            <View style={styles.logoDot} />
            <Text style={styles.brand}>SafeWallet</Text>
            <Text style={styles.tagline}>your pause before the bet</Text>
          </View>

          <Text style={styles.title}>welcome back</Text>

          <TextInput
            mode="outlined"
            label="email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            outlineColor={colors.outline}
            activeOutlineColor={colors.teal}
            textColor={colors.text}
          />
          <TextInput
            mode="outlined"
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
            style={styles.input}
            outlineColor={colors.outline}
            activeOutlineColor={colors.teal}
            textColor={colors.text}
          />

          {!!error && (
            <HelperText type="error" visible style={styles.error}>
              {error}
            </HelperText>
          )}

          <PrimaryButton
            label={busy ? 'signing in…' : 'log in'}
            onPress={onSubmit}
            disabled={busy}
            style={styles.cta}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>new here? </Text>
            <Link href="/register" style={styles.link}>
              create an account
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(3),
  },
  brandWrap: { alignItems: 'center', marginBottom: spacing(5) },
  logoDot: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.teal,
    marginBottom: spacing(1.5),
  },
  brand: { color: colors.text, fontSize: 26, fontWeight: '800' },
  tagline: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing(2),
  },
  input: {
    marginBottom: spacing(1.5),
    backgroundColor: colors.surface,
  },
  error: { marginBottom: spacing(1) },
  cta: { marginTop: spacing(1) },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing(3),
  },
  footerText: { color: colors.textMuted },
  link: { color: colors.teal, fontWeight: '700' },
});
