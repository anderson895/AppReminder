import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { user, admin } = useAuth();
  if (admin) return <Redirect href="/admin" />;
  if (user) return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
