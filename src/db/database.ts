import * as SQLite from 'expo-sqlite';
import type {
  User,
  Admin,
  TriggerApp,
  UserSettings,
  AccessEvent,
  DailyLog,
  Stats,
  AdminStats,
  Category,
  EventAction,
  LoginResult,
} from '../types';

/**
 * BettrMind local database (SQLite via expo-sqlite, async API).
 *
 * Tables
 *  - users          : account credentials + profile
 *  - admins          : separate admin accounts (manage the global trigger list)
 *  - trigger_apps    : GLOBAL master list of watched apps (admin-managed)
 *  - access_events   : every detected access attempt (the audit trail)
 *  - daily_logs      : per-day rollup; gambling_count increments +1 per attempt
 *  - user_settings   : friction-popup message + countdown configuration
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('safewallet.db');
  }
  return dbPromise;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trigger_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      category TEXT NOT NULL,           -- 'gambling' | 'financial'
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      app_name TEXT NOT NULL,
      category TEXT NOT NULL,           -- 'gambling' | 'financial' | 'other'
      action TEXT NOT NULL,             -- 'resisted' | 'proceeded' | 'opened'
      day TEXT NOT NULL,                -- YYYY-MM-DD
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,                -- YYYY-MM-DD
      gambling_count INTEGER NOT NULL DEFAULT 0,
      resisted_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (user_id, day),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      family_member TEXT NOT NULL DEFAULT 'mama',
      family_message TEXT NOT NULL DEFAULT 'Anak, we believe in you. Every day you choose us over gambling, you give us our future back.',
      countdown_seconds INTEGER NOT NULL DEFAULT 10,
      monitoring_granted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await migrate(db);
  await seedDefaults(db);
}

/** Schema migrations to keep databases from older versions tidy. */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(user_settings)'
  );
  const hasCol = (name: string) => cols.some((c) => c.name === name);

  // Add the monitoring-consent flag if missing.
  if (!hasCol('monitoring_granted')) {
    await db.runAsync(
      'ALTER TABLE user_settings ADD COLUMN monitoring_granted INTEGER NOT NULL DEFAULT 0'
    );
  }

  // Drop the unused per-user app table (replaced by the global trigger_apps).
  await db.runAsync('DROP TABLE IF EXISTS monitored_apps');

  // Drop the unused avg_amount column (tied to the removed "money not gambled").
  if (hasCol('avg_amount')) {
    try {
      await db.runAsync('ALTER TABLE user_settings DROP COLUMN avg_amount');
    } catch {
      // Older SQLite without DROP COLUMN support — leave it; it is harmless.
    }
  }
}

/** Seed the default admin account and the global trigger-app list once. */
async function seedDefaults(db: SQLite.SQLiteDatabase): Promise<void> {
  const adminCount = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM admins'
  );
  if ((adminCount?.c ?? 0) === 0) {
    await db.runAsync(
      'INSERT INTO admins (name, email, password, created_at) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin@gmail.com', 'admin123', new Date().toISOString()]
    );
  }

  const appCount = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM trigger_apps'
  );
  if ((appCount?.c ?? 0) === 0) {
    const now = new Date().toISOString();
    for (const app of DEFAULT_APPS) {
      await db.runAsync(
        'INSERT INTO trigger_apps (app_name, category, enabled, created_at) VALUES (?, ?, 1, ?)',
        [app.app_name, app.category, now]
      );
    }
  }
}

/* ----------------------------- helpers ----------------------------- */

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DEFAULT_APPS: ReadonlyArray<{ app_name: string; category: Category }> = [
  { app_name: 'GCash', category: 'financial' },
  { app_name: 'Maya', category: 'financial' },
  { app_name: 'GrabPay', category: 'financial' },
  { app_name: 'Online Casino', category: 'gambling' },
  { app_name: 'Sports Betting', category: 'gambling' },
  { app_name: 'eBingo', category: 'gambling' },
];

/* ------------------------------ auth ------------------------------- */

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const db = await getDb();
  const created = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)',
    [input.name.trim(), input.email.trim().toLowerCase(), input.password, created]
  );
  const userId = result.lastInsertRowId;

  // Seed per-user settings. The trigger-app list is global (admin-managed).
  await db.runAsync('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
  const user = await getUserById(userId);
  if (!user) throw new Error('Failed to create user');
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  return db.getFirstAsync<User>('SELECT * FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
}

export async function getUserById(id: number): Promise<User | null> {
  const db = await getDb();
  return db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [id]);
}

export async function getAdminByEmail(email: string): Promise<Admin | null> {
  const db = await getDb();
  return db.getFirstAsync<Admin>('SELECT * FROM admins WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
}

/**
 * Single login entry point: admin accounts are checked first, then users.
 * The returned `role` tells the UI where to route.
 */
export async function verifyLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  const admin = await getAdminByEmail(email);
  if (admin) {
    if (admin.password !== password) return { ok: false, reason: 'bad-password' };
    return { ok: true, role: 'admin', admin };
  }

  const user = await getUserByEmail(email);
  if (!user) return { ok: false, reason: 'no-account' };
  if (user.password !== password) return { ok: false, reason: 'bad-password' };
  return { ok: true, role: 'user', user };
}

/* ---------------------------- settings ----------------------------- */

export async function getSettings(userId: number): Promise<UserSettings> {
  const db = await getDb();
  let row = await db.getFirstAsync<UserSettings>(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [userId]
  );
  if (!row) {
    await db.runAsync('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
    row = await db.getFirstAsync<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId]
    );
  }
  if (!row) throw new Error('Failed to load settings');
  return row;
}

export async function updateSettings(
  userId: number,
  patch: {
    family_member: string;
    family_message: string;
    countdown_seconds: number;
  }
): Promise<UserSettings> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE user_settings
       SET family_member = ?, family_message = ?, countdown_seconds = ?
     WHERE user_id = ?`,
    [patch.family_member, patch.family_message, patch.countdown_seconds, userId]
  );
  return getSettings(userId);
}

export async function setMonitoringGranted(
  userId: number,
  granted: boolean
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE user_settings SET monitoring_granted = ? WHERE user_id = ?',
    [granted ? 1 : 0, userId]
  );
}

/* --------------------- trigger apps (global, admin) ---------------- */

export async function getTriggerApps(): Promise<TriggerApp[]> {
  const db = await getDb();
  return db.getAllAsync<TriggerApp>(
    'SELECT * FROM trigger_apps ORDER BY category DESC, app_name ASC'
  );
}

/** Only the enabled apps — what the detector / user side actually watches. */
export async function getEnabledTriggerApps(): Promise<TriggerApp[]> {
  const db = await getDb();
  return db.getAllAsync<TriggerApp>(
    'SELECT * FROM trigger_apps WHERE enabled = 1 ORDER BY category DESC, app_name ASC'
  );
}

export async function addTriggerApp(
  appName: string,
  category: Category
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO trigger_apps (app_name, category, enabled, created_at) VALUES (?, ?, 1, ?)',
    [appName.trim(), category, new Date().toISOString()]
  );
}

export async function updateTriggerApp(
  id: number,
  appName: string,
  category: Category
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE trigger_apps SET app_name = ?, category = ? WHERE id = ?',
    [appName.trim(), category, id]
  );
}

export async function deleteTriggerApp(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trigger_apps WHERE id = ?', [id]);
}

export async function toggleTriggerApp(id: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trigger_apps SET enabled = ? WHERE id = ?', [
    enabled ? 1 : 0,
    id,
  ]);
}

/* ----------------------------- admin stats ------------------------- */

export async function getAdminStats(): Promise<AdminStats> {
  const db = await getDb();
  const users = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM users'
  );
  const apps = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM trigger_apps'
  );
  const totals = await db.getFirstAsync<{
    g: number;
    r: number;
  }>(
    `SELECT COALESCE(SUM(gambling_count), 0) AS g,
            COALESCE(SUM(resisted_count), 0) AS r
     FROM daily_logs`
  );
  return {
    totalUsers: users?.c ?? 0,
    triggerAppCount: apps?.c ?? 0,
    totalGamblingAttempts: totals?.g ?? 0,
    totalResisted: totals?.r ?? 0,
  };
}

/* ----------------------------- events ------------------------------ */

/**
 * Record the outcome of a detected access attempt.
 * Per the spec, a gambling 'proceeded' attempt increments the daily count +1.
 */
export async function recordEvent(input: {
  userId: number;
  appName: string;
  category: Category;
  action: EventAction;
}): Promise<void> {
  const db = await getDb();
  const day = todayKey();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO access_events (user_id, app_name, category, action, day, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.userId, input.appName, input.category, input.action, day, now]
  );

  // Ensure a daily row exists.
  await db.runAsync('INSERT OR IGNORE INTO daily_logs (user_id, day) VALUES (?, ?)', [
    input.userId,
    day,
  ]);

  const isGambling = input.category === 'gambling';
  if (input.action === 'proceeded' && isGambling) {
    await db.runAsync(
      'UPDATE daily_logs SET gambling_count = gambling_count + 1 WHERE user_id = ? AND day = ?',
      [input.userId, day]
    );
  } else if (input.action === 'resisted') {
    await db.runAsync(
      'UPDATE daily_logs SET resisted_count = resisted_count + 1 WHERE user_id = ? AND day = ?',
      [input.userId, day]
    );
  }
}

/**
 * Log that an app was opened, regardless of whether it is on the trigger list.
 * Non-trigger apps are recorded with category 'other' and action 'opened'
 * (no counters change) — this is how the activity log captures every app.
 */
export async function recordAppOpen(
  userId: number,
  appName: string,
  category: Category = 'other'
): Promise<void> {
  return recordEvent({ userId, appName, category, action: 'opened' });
}

export async function getDailyLogs(userId: number, limit = 30): Promise<DailyLog[]> {
  const db = await getDb();
  return db.getAllAsync<DailyLog>(
    'SELECT * FROM daily_logs WHERE user_id = ? ORDER BY day DESC LIMIT ?',
    [userId, limit]
  );
}

export async function getRecentEvents(
  userId: number,
  limit = 50
): Promise<AccessEvent[]> {
  const db = await getDb();
  return db.getAllAsync<AccessEvent>(
    'SELECT * FROM access_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
}

/**
 * Permanently delete a single user's activity history
 * (daily rollups + individual events). Settings and account are untouched.
 */
export async function clearUserLogs(userId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM access_events WHERE user_id = ?', [userId]);
  await db.runAsync('DELETE FROM daily_logs WHERE user_id = ?', [userId]);
}

/* --------------------------- derived stats ------------------------- */

export async function getStats(userId: number): Promise<Stats> {
  const db = await getDb();

  const totals = await db.getFirstAsync<{
    total_resisted: number;
    total_gambling: number;
  }>(
    `SELECT
       COALESCE(SUM(resisted_count), 0) AS total_resisted,
       COALESCE(SUM(gambling_count), 0) AS total_gambling
     FROM daily_logs WHERE user_id = ?`,
    [userId]
  );
  const totalResisted = totals?.total_resisted ?? 0;
  const totalGambling = totals?.total_gambling ?? 0;

  // Bet-free streak: consecutive days (ending today) with zero gambling attempts.
  const logs = await db.getAllAsync<{ day: string; gambling_count: number }>(
    'SELECT day, gambling_count FROM daily_logs WHERE user_id = ? ORDER BY day DESC',
    [userId]
  );
  const map = new Map(logs.map((l) => [l.day, l.gambling_count]));
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i += 1) {
    const key = todayKey(cursor);
    const count = map.get(key) ?? 0;
    if (count > 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const longest = computeLongestStreak(logs);

  return {
    streakDays: streak,
    longestStreakWeeks: Math.max(1, Math.floor(longest / 7)),
    longestStreakDays: longest,
    urgesResisted: totalResisted,
    gamblingAttempts: totalGambling,
  };
}

function computeLongestStreak(
  logsDesc: ReadonlyArray<{ day: string; gambling_count: number }>
): number {
  // Build a set of "dirty" days (gambling_count > 0) and walk from first activity to today.
  const dirty = new Set(
    logsDesc.filter((l) => l.gambling_count > 0).map((l) => l.day)
  );
  if (logsDesc.length === 0) return 0;
  const oldest = logsDesc[logsDesc.length - 1]!.day;
  const start = new Date(oldest + 'T00:00:00');
  const end = new Date();
  let best = 0;
  let current = 0;
  const c = new Date(start);
  while (c <= end) {
    const key = todayKey(c);
    if (dirty.has(key)) {
      current = 0;
    } else {
      current += 1;
      if (current > best) best = current;
    }
    c.setDate(c.getDate() + 1);
  }
  return best;
}
