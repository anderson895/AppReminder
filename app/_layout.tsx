import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';

import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { initDatabase } from '../src/db/database';
import { useRemoteGate } from '../src/remoteGate';
import { stopMonitoring } from '../src/native/detector';
import type { Palette } from '../src/theme';

/** Shown when the developer has remotely disabled the app. */
function LockScreen({ colors, message }: { colors: Palette; message: string }) {
  return (
    <View style={[styles.lock, { backgroundColor: colors.background }]}>
      <MaterialCommunityIcons name="lock-alert" size={64} color={colors.teal} />
      <Text style={[styles.lockTitle, { color: colors.text }]}>Access restricted</Text>
      <Text style={[styles.lockMsg, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

/** Inner app: reads the active theme so a switch re-themes everything. */
function ThemedApp() {
  const { colors, paperTheme } = useTheme();
  const gate = useRemoteGate();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((e: unknown) => setDbError(e instanceof Error ? e.message : String(e)));
  }, []);

  // If the app is remotely disabled, also stop the native monitor.
  useEffect(() => {
    if (gate.locked) {
      try {
        stopMonitoring();
      } catch {
        // no-op when the native module isn't available
      }
    }
  }, [gate.locked]);

  const loadingView = (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.teal} size="large" />
      {dbError ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          Database error: {dbError}
        </Text>
      ) : (
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Setting up BettrMind…
        </Text>
      )}
    </View>
  );

  let content: React.ReactNode;
  if (!gate.ready) {
    content = loadingView;
  } else if (gate.locked) {
    content = <LockScreen colors={colors} message={gate.message} />;
  } else {
    content = (
      <AuthProvider dbReady={dbReady}>
        {dbReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen
              name="reminder"
              options={{ presentation: 'modal', animation: 'fade' }}
            />
            <Stack.Screen
              name="countdown"
              options={{ presentation: 'modal', animation: 'fade' }}
            />
          </Stack>
        ) : (
          loadingView
        )}
      </AuthProvider>
    );
  }

  return (
    <PaperProvider theme={paperTheme}>
      <StatusBar style="light" />
      {content}
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 14 },
  error: { fontSize: 13, paddingHorizontal: 32, textAlign: 'center' },
  lock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 14,
  },
  lockTitle: { fontSize: 22, fontWeight: '800' },
  lockMsg: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
