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
  AppSuggestion,
  SuggestionWithUser,
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
      package_name TEXT NOT NULL DEFAULT '',
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
      countdown_seconds INTEGER NOT NULL DEFAULT 900,
      monitoring_granted INTEGER NOT NULL DEFAULT 0,
      motivation_photo TEXT NOT NULL DEFAULT '',  -- local uri of the photo shown on the friction popup
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- User-submitted suggestions for apps to block. The admin reviews each
    -- (pending -> approved/rejected); approving copies it into trigger_apps.
    CREATE TABLE IF NOT EXISTS app_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      app_name TEXT NOT NULL,
      package_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,            -- 'gambling' | 'financial'
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
      created_at TEXT NOT NULL,
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

  // Add the friction-popup photo uri if missing.
  if (!hasCol('motivation_photo')) {
    await db.runAsync(
      "ALTER TABLE user_settings ADD COLUMN motivation_photo TEXT NOT NULL DEFAULT ''"
    );
  }

  // Pause length is now 15 or 30 minutes — bump old short values (seconds).
  await db.runAsync(
    'UPDATE user_settings SET countdown_seconds = 900 WHERE countdown_seconds < 900'
  );

  // Drop the unused per-user app table (replaced by the global trigger_apps).
  await db.runAsync('DROP TABLE IF EXISTS monitored_apps');

  // Add package_name to trigger_apps if missing (needed for native detection).
  const triggerCols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(trigger_apps)'
  );
  if (!triggerCols.some((c) => c.name === 'package_name')) {
    await db.runAsync(
      "ALTER TABLE trigger_apps ADD COLUMN package_name TEXT NOT NULL DEFAULT ''"
    );
  }

  // Drop the unused avg_amount column (tied to the removed "money not gambled").
  if (hasCol('avg_amount')) {
    try {
      await db.runAsync('ALTER TABLE user_settings DROP COLUMN avg_amount');
    } catch {
      // Older SQLite without DROP COLUMN support — leave it; it is harmless.
    }
  }

  // Add the "user has been told this suggestion was resolved" flag if missing,
  // so we can notify them once when the admin approves/rejects their suggestion.
  const suggestionCols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(app_suggestions)'
  );
  if (!suggestionCols.some((c) => c.name === 'notified')) {
    await db.runAsync(
      'ALTER TABLE app_suggestions ADD COLUMN notified INTEGER NOT NULL DEFAULT 0'
    );
    // Existing already-resolved suggestions predate this feature — treat them as
    // already seen so we don't notify retroactively.
    await db.runAsync(
      "UPDATE app_suggestions SET notified = 1 WHERE status != 'pending'"
    );
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
        'INSERT INTO trigger_apps (app_name, package_name, category, enabled, created_at) VALUES (?, ?, ?, 1, ?)',
        [app.app_name, app.package_name, app.category, now]
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

const DEFAULT_APPS: ReadonlyArray<{
  app_name: string;
  package_name: string;
  category: Category;
}> = [
  // E-wallets / financial apps shown on the main page as "blocked".
  { app_name: 'GCash', package_name: 'com.globe.gcash.android', category: 'financial' },
  { app_name: 'Maya', package_name: 'com.paymaya', category: 'financial' },
  { app_name: 'GoTyme', package_name: '', category: 'financial' },
  { app_name: 'GrabPay', package_name: 'com.grabtaxi.passenger', category: 'financial' },
  // Casino brands from PAGCOR's official list of approved/licensed online
  // casinos (List of PAGCOR-Approved Registered Brands as of May 28, 2026).
  // Most are web-based; package_name is left blank and an admin can attach a
  // package via the installed-app picker for any that ship a dedicated app.
  { app_name: 'Midori Online', package_name: '', category: 'gambling' },
  { app_name: 'Solaire Online', package_name: '', category: 'gambling' },
  { app_name: "D'Heights Online", package_name: '', category: 'gambling' },
  { app_name: 'Thunderbird Online Rizal', package_name: '', category: 'gambling' },
  { app_name: 'HANN Online', package_name: '', category: 'gambling' },
  { app_name: 'Lavie Casino', package_name: '', category: 'gambling' },
  { app_name: 'Winford Online', package_name: '', category: 'gambling' },
  { app_name: 'Casino Plus', package_name: '', category: 'gambling' },
  { app_name: 'Okada Online Casino', package_name: '', category: 'gambling' },
  { app_name: 'Thunderbird Online Poro', package_name: '', category: 'gambling' },
  { app_name: 'NWR Epic World', package_name: '', category: 'gambling' },
  { app_name: 'Casino Maxx', package_name: '', category: 'gambling' },
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

export async function getAdminById(id: number): Promise<Admin | null> {
  const db = await getDb();
  return db.getFirstAsync<Admin>('SELECT * FROM admins WHERE id = ?', [id]);
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
    motivation_photo?: string;
  }
): Promise<UserSettings> {
  const db = await getDb();
  if (patch.motivation_photo !== undefined) {
    await db.runAsync(
      `UPDATE user_settings
         SET family_member = ?, family_message = ?, countdown_seconds = ?, motivation_photo = ?
       WHERE user_id = ?`,
      [
        patch.family_member,
        patch.family_message,
        patch.countdown_seconds,
        patch.motivation_photo,
        userId,
      ]
    );
  } else {
    await db.runAsync(
      `UPDATE user_settings
         SET family_member = ?, family_message = ?, countdown_seconds = ?
       WHERE user_id = ?`,
      [patch.family_member, patch.family_message, patch.countdown_seconds, userId]
    );
  }
  return getSettings(userId);
}

/** Save just the friction-popup photo uri (used by the setup-motivation step). */
export async function setMotivationPhoto(
  userId: number,
  uri: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE user_settings SET motivation_photo = ? WHERE user_id = ?',
    [uri, userId]
  );
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
  category: Category,
  packageName = ''
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO trigger_apps (app_name, package_name, category, enabled, created_at) VALUES (?, ?, ?, 1, ?)',
    [appName.trim(), packageName.trim(), category, new Date().toISOString()]
  );
}

export async function updateTriggerApp(
  id: number,
  appName: string,
  category: Category,
  packageName = ''
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE trigger_apps SET app_name = ?, package_name = ?, category = ? WHERE id = ?',
    [appName.trim(), packageName.trim(), category, id]
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

/** The enabled financial apps shown read-only on the main page as "blocked". */
export async function getBlockedEwallets(): Promise<TriggerApp[]> {
  const db = await getDb();
  return db.getAllAsync<TriggerApp>(
    "SELECT * FROM trigger_apps WHERE enabled = 1 AND category = 'financial' ORDER BY app_name ASC"
  );
}

/** The enabled gambling/casino apps (PAGCOR list) shown read-only on the main page. */
export async function getBlockedCasinos(): Promise<TriggerApp[]> {
  const db = await getDb();
  return db.getAllAsync<TriggerApp>(
    "SELECT * FROM trigger_apps WHERE enabled = 1 AND category = 'gambling' ORDER BY app_name ASC"
  );
}

/* ----------------------- app suggestions (user) -------------------- */

/** A user proposes an app to block; it waits for admin review. */
export async function addSuggestion(
  userId: number,
  appName: string,
  category: Category,
  packageName = ''
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_suggestions (user_id, app_name, package_name, category, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [userId, appName.trim(), packageName.trim(), category, new Date().toISOString()]
  );
}

/** A user's own suggestions (so they can see status), newest first. */
export async function getUserSuggestions(userId: number): Promise<AppSuggestion[]> {
  const db = await getDb();
  return db.getAllAsync<AppSuggestion>(
    'SELECT * FROM app_suggestions WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

/** Resolved (approved/rejected) suggestions the user hasn't been notified of yet. */
export async function getUnnotifiedSuggestions(userId: number): Promise<AppSuggestion[]> {
  const db = await getDb();
  return db.getAllAsync<AppSuggestion>(
    "SELECT * FROM app_suggestions WHERE user_id = ? AND status != 'pending' AND notified = 0 ORDER BY created_at DESC",
    [userId]
  );
}

/** Mark suggestions as notified so the user isn't told about them again. */
export async function markSuggestionsNotified(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE app_suggestions SET notified = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

/** All pending suggestions for the admin review queue, with the submitter name. */
export async function getPendingSuggestions(): Promise<SuggestionWithUser[]> {
  const db = await getDb();
  return db.getAllAsync<SuggestionWithUser>(
    `SELECT s.*, u.name AS user_name, u.email AS user_email
       FROM app_suggestions s
       JOIN users u ON u.id = s.user_id
      WHERE s.status = 'pending'
      ORDER BY s.created_at ASC`
  );
}

export async function countPendingSuggestions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM app_suggestions WHERE status = 'pending'"
  );
  return row?.c ?? 0;
}

/** Approve a suggestion: copy it into the global trigger list, mark approved. */
export async function approveSuggestion(id: number): Promise<void> {
  const db = await getDb();
  const s = await db.getFirstAsync<AppSuggestion>(
    'SELECT * FROM app_suggestions WHERE id = ?',
    [id]
  );
  if (!s) return;
  await db.runAsync(
    'INSERT INTO trigger_apps (app_name, package_name, category, enabled, created_at) VALUES (?, ?, ?, 1, ?)',
    [s.app_name, s.package_name, s.category, new Date().toISOString()]
  );
  await db.runAsync("UPDATE app_suggestions SET status = 'approved' WHERE id = ?", [id]);
}

export async function rejectSuggestion(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE app_suggestions SET status = 'rejected' WHERE id = ?", [id]);
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

  // "Urges blocked": every time a casino/gambling app was opened and the
  // reminder stepped in (whether the user resisted or proceeded).
  const blocked = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM access_events
      WHERE user_id = ? AND category = 'gambling'
        AND action IN ('resisted', 'proceeded')`,
    [userId]
  );
  const urgesBlocked = blocked?.c ?? 0;

  // Bet-free streak: consecutive days (ending today) with zero gambling attempts.
  const logs = await db.getAllAsync<{ day: string; gambling_count: number }>(
    'SELECT day, gambling_count FROM daily_logs WHERE user_id = ? ORDER BY day DESC',
    [userId]
  );
  const map = new Map(logs.map((l) => [l.day, l.gambling_count]));

  // Cap the streak at the account's signup day — you can't be bet-free before
  // you started using the app. Without this, days with no log default to 0
  // gambling and every prior day (up to a year) counts as bet-free, so a brand
  // new account immediately shows a misleadingly large, fixed-looking number.
  const userRow = await db.getFirstAsync<{ created_at: string }>(
    'SELECT created_at FROM users WHERE id = ?',
    [userId]
  );
  const signupKey = userRow ? todayKey(new Date(userRow.created_at)) : todayKey();

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i += 1) {
    const key = todayKey(cursor);
    const count = map.get(key) ?? 0;
    if (count > 0) break;
    streak += 1;
    if (key === signupKey) break; // reached the signup day — stop counting
    cursor.setDate(cursor.getDate() - 1);
  }

  const longest = computeLongestStreak(logs);

  return {
    streakDays: streak,
    longestStreakWeeks: Math.max(1, Math.floor(longest / 7)),
    longestStreakDays: longest,
    urgesResisted: totalResisted,
    urgesBlocked,
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
