/** Shared domain types for SafeWallet. */

export type Category = 'gambling' | 'financial';
export type EventAction = 'resisted' | 'proceeded';

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  created_at: string;
}

export interface UserSettings {
  user_id: number;
  family_member: string;
  family_message: string;
  countdown_seconds: number;
  avg_amount: number;
}

export interface MonitoredApp {
  id: number;
  user_id: number;
  app_name: string;
  category: Category;
  enabled: number; // SQLite stores booleans as 0 | 1
}

export interface AccessEvent {
  id: number;
  user_id: number;
  app_name: string;
  category: Category;
  action: EventAction;
  day: string;
  created_at: string;
}

export interface DailyLog {
  id: number;
  user_id: number;
  day: string;
  gambling_count: number;
  resisted_count: number;
}

export interface Stats {
  streakDays: number;
  longestStreakWeeks: number;
  longestStreakDays: number;
  urgesResisted: number;
  gamblingAttempts: number;
  moneyNotGambled: number;
  avgAmount: number;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'no-account' | 'bad-password' };

export type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'exists' | 'error' };
