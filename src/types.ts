/** Shared domain types for BetFree. All ids are Firestore document ids. */

export type Category = 'gambling' | 'financial' | 'other';
export type EventAction = 'resisted' | 'proceeded' | 'opened';
export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  created_at: string;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  password: string;
  created_at: string;
}

/** Global master list of apps the system watches (managed by the admin). */
export interface TriggerApp {
  id: string;
  app_name: string;
  package_name: string; // Android package id, e.g. com.globe.gcash.android
  category: Category;
  enabled: number; // 0 | 1
  created_at: string;
}

/** An app-open detected by the native monitor, buffered for the JS side to log. */
export interface DetectedOpen {
  packageName: string;
  appName: string;
  category: Category;
  isTrigger: boolean;
  action: EventAction; // 'opened' | 'resisted' | 'proceeded'
  at: number; // epoch ms
}

export interface UserSettings {
  user_id: string;
  family_member: string;
  family_message: string;
  countdown_seconds: number;
  monitoring_granted: number; // 0 | 1 — user consented to app monitoring
  motivation_photo: string; // local uri of the photo shown on the friction popup ('' = none)
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

/** A user-submitted app-to-block, awaiting admin review. */
export interface AppSuggestion {
  id: string;
  user_id: string;
  app_name: string;
  package_name: string;
  category: Category;
  status: SuggestionStatus;
  notified?: number; // 0 | 1 — user has been told this suggestion was resolved
  created_at: string;
}

/** A pending suggestion joined with the submitter (for the admin queue). */
export interface SuggestionWithUser extends AppSuggestion {
  user_name: string;
  user_email: string;
}

export interface AccessEvent {
  id: string;
  user_id: string;
  app_name: string;
  category: Category;
  action: EventAction;
  day: string;
  created_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  day: string;
  gambling_count: number;
  resisted_count: number;
}

export interface Stats {
  streakDays: number;
  longestStreakWeeks: number;
  longestStreakDays: number;
  urgesResisted: number;
  urgesBlocked: number; // times a casino app was opened and the reminder intervened
  gamblingAttempts: number;
}

export interface AdminStats {
  totalUsers: number;
  totalGamblingAttempts: number;
  totalResisted: number;
  triggerAppCount: number;
}

export type LoginResult =
  | { ok: true; role: 'user'; user: User }
  | { ok: true; role: 'admin'; admin: Admin }
  | { ok: false; reason: 'no-account' | 'bad-password' };

export type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'exists' | 'error' };
