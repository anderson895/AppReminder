import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';

import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { initDatabase } from '../src/db/database';

/** Inner app: reads the active theme so a switch re-themes everything. */
function ThemedApp() {
  const { colors, paperTheme } = useTheme();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((e: unknown) => setDbError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
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
        )}
      </AuthProvider>
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
});
