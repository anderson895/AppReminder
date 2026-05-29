import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';

import { paperTheme, colors } from '../src/theme';
import { AuthProvider } from '../src/context/AuthContext';
import { initDatabase } from '../src/db/database';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((e: unknown) =>
        setDbError(e instanceof Error ? e.message : String(e))
      );
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <AuthProvider dbReady={dbReady}>
            <StatusBar style="light" />
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
              <View style={styles.loading}>
                <ActivityIndicator color={colors.teal} size="large" />
                {dbError ? (
                  <Text style={styles.error}>Database error: {dbError}</Text>
                ) : (
                  <Text style={styles.loadingText}>Setting up BettrMind…</Text>
                )}
              </View>
            )}
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  error: {
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
});
