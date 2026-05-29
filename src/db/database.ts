import * as SQLite from 'expo-sqlite';
import type {
  User,
  UserSettings,
  MonitoredApp,
  AccessEvent,
  DailyLog,
  Stats,
  Category,
  EventAction,
  LoginResult,
} from '../types';

/**
 * SafeWallet local database (SQLite via expo-sqlite, async API).
 *
 * Tables
 *  - users          : account credentials + profile
 *  - monitored_apps  : gambling / financial apps watched per user
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

    CREATE TABLE IF NOT EXISTS monitored_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      app_name TEXT NOT NULL,
      category TEXT NOT NULL,           -- 'gambling' | 'financial'
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      app_name TEXT NOT NULL,
      category TEXT NOT NULL,           -- 'gambling' | 'financial'
      action TEXT NOT NULL,             -- 'resisted' | 'proceeded'
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
      avg_amount INTEGER NOT NULL DEFAULT 400,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
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

  // Seed defaults for the new account.
  await db.runAsync('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
  for (const app of DEFAULT_APPS) {
    await db.runAsync(
      'INSERT INTO monitored_apps (user_id, app_name, category) VALUES (?, ?, ?)',
      [userId, app.app_name, app.category]
    );
  }
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

export async function verifyLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  const user = await getUserByEmail(email);
  if (!user) return { ok: false, reason: 'no-account' };
  if (user.password !== password) return { ok: false, reason: 'bad-password' };
  return { ok: true, user };
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
    avg_amount: number;
  }
): Promise<UserSettings> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE user_settings
       SET family_member = ?, family_message = ?, countdown_seconds = ?, avg_amount = ?
     WHERE user_id = ?`,
    [
      patch.family_member,
      patch.family_message,
      patch.countdown_seconds,
      patch.avg_amount,
      userId,
    ]
  );
  return getSettings(userId);
}

/* -------------------------- monitored apps ------------------------- */

export async function getMonitoredApps(userId: number): Promise<MonitoredApp[]> {
  const db = await getDb();
  return db.getAllAsync<MonitoredApp>(
    'SELECT * FROM monitored_apps WHERE user_id = ? ORDER BY category DESC, app_name ASC',
    [userId]
  );
}

export async function toggleMonitoredApp(id: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE monitored_apps SET enabled = ? WHERE id = ?', [
    enabled ? 1 : 0,
    id,
  ]);
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

/* --------------------------- derived stats ------------------------- */

export async function getStats(userId: number): Promise<Stats> {
  const db = await getDb();
  const settings = await getSettings(userId);

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
  const moneyNotGambled = totalResisted * settings.avg_amount;

  return {
    streakDays: streak,
    longestStreakWeeks: Math.max(1, Math.floor(longest / 7)),
    longestStreakDays: longest,
    urgesResisted: totalResisted,
    gamblingAttempts: totalGambling,
    moneyNotGambled,
    avgAmount: settings.avg_amount,
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
