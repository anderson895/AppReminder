import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? '/dashboard' : '/login'} />;
}
