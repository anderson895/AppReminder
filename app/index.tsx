import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function Index() {
  const { user, admin, ready } = useAuth();
  const { colors } = useTheme();

  // Wait until a saved session (if any) has been restored.
  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }

  if (admin) return <Redirect href="/admin" />;
  if (user) return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
