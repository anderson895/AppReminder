import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';

import { spacing, type Palette } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PrimaryButton } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { getSettings } from '../src/db/database';

export default function Login() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      if (res.ok && res.role === 'admin') {
        router.replace('/admin');
      } else if (res.ok && res.role === 'user') {
        // Send the user through the monitoring-permission flow until they grant it.
        const settings = await getSettings(res.user.id);
        router.replace(settings.monitoring_granted ? '/dashboard' : '/permission');
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
            <Image
              source={require('../assets/icon.png')}
              style={styles.logoImg}
              resizeMode="contain"
            />
            <Text style={styles.brand}>BetFree</Text>
            <Text style={styles.tagline}>Pause. Think. Choose better.</Text>
          </View>

          <Text style={styles.title}>Welcome Back</Text>

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
            label={busy ? 'Signing in…' : 'Log In'}
            onPress={onSubmit}
            disabled={busy}
            style={styles.cta}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>New here? </Text>
            <Link href="/register" style={styles.link}>
              Create an account
            </Link>
          </View>

          <Text style={styles.adminHint}>
            Admin? Log in with your admin credentials above.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(3),
  },
  brandWrap: { alignItems: 'center', marginBottom: spacing(5) },
  logoImg: {
    width: 110,
    height: 110,
    borderRadius: 24,
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
  adminHint: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing(2),
  },
});
