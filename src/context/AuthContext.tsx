import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUser,
  verifyLogin,
  getUserByEmail,
  getUserById,
  getAdminById,
} from '../db/database';
import type { User, Admin, LoginResult, RegisterResult } from '../types';

const SESSION_KEY = 'bettrmind_session';

interface AuthContextValue {
  user: User | null;
  admin: Admin | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<RegisterResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(role: 'user' | 'admin', id: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ role, id }));
  } catch {
    // non-fatal: session just won't survive a restart
  }
}

export function AuthProvider({
  children,
  dbReady,
}: {
  children: ReactNode;
  dbReady: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [ready, setReady] = useState(false);

  // Restore a saved session once the database is available.
  useEffect(() => {
    if (!dbReady) return;
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const { role, id } = JSON.parse(raw) as { role: string; id: number };
          if (role === 'admin') {
            const a = await getAdminById(id);
            if (active && a) setAdmin(a);
          } else {
            const u = await getUserById(id);
            if (active && u) setUser(u);
          }
        }
      } catch {
        // ignore corrupt/missing session
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [dbReady]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await verifyLogin(email, password);
      if (res.ok && res.role === 'admin') {
        setAdmin(res.admin);
        setUser(null);
        await persistSession('admin', res.admin.id);
      } else if (res.ok && res.role === 'user') {
        setUser(res.user);
        setAdmin(null);
        await persistSession('user', res.user.id);
      }
      return res;
    },
    []
  );

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
    }): Promise<RegisterResult> => {
      const existing = await getUserByEmail(input.email);
      if (existing) return { ok: false, reason: 'exists' };
      const newUser = await createUser(input);
      setUser(newUser);
      setAdmin(null);
      await persistSession('user', newUser.id);
      return { ok: true, user: newUser };
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    setAdmin(null);
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }, []);

  const value: AuthContextValue = { user, admin, ready, login, register, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
