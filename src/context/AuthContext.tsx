import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { createUser, verifyLogin, getUserByEmail } from '../db/database';
import type { User, Admin, LoginResult, RegisterResult } from '../types';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [ready] = useState(true);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await verifyLogin(email, password);
      if (res.ok && res.role === 'admin') {
        setAdmin(res.admin);
        setUser(null);
      } else if (res.ok && res.role === 'user') {
        setUser(res.user);
        setAdmin(null);
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
      return { ok: true, user: newUser };
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    setAdmin(null);
  }, []);

  const value: AuthContextValue = { user, admin, ready, login, register, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
