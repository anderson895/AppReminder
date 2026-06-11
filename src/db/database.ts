import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  query,
  where,
  orderBy,
  limit as qLimit,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
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
 * BetFree online database (Cloud Firestore).
 *
 * Every device shares the same backend, so whatever the admin sets as a
 * trigger app reflects on all installed devices, and user suggestions reach
 * the admin no matter which phone they were sent from.
 *
 * Collections
 *  - users           : account credentials + profile
 *  - admins          : separate admin accounts (manage the global trigger list)
 *  - trigger_apps    : GLOBAL master list of watched apps (admin-managed)
 *  - access_events   : every detected access attempt (the audit trail)
 *  - daily_logs      : per-day rollup; doc id `${userId}_${day}`
 *  - user_settings   : friction-popup message + countdown config; doc id = userId
 *  - app_suggestions : user-submitted apps-to-block awaiting admin review
 */

const usersCol = collection(db, 'users');
const adminsCol = collection(db, 'admins');
const triggerAppsCol = collection(db, 'trigger_apps');
const accessEventsCol = collection(db, 'access_events');
const dailyLogsCol = collection(db, 'daily_logs');
const userSettingsCol = collection(db, 'user_settings');
const suggestionsCol = collection(db, 'app_suggestions');

/** Map a Firestore snapshot to a typed row with its document id. */
function withId<T>(snap: QueryDocumentSnapshot<DocumentData>): T {
  return { id: snap.id, ...snap.data() } as T;
}

/**
 * Seed the default admin account and trigger-app list once. Deterministic doc
 * ids keep concurrent first-runs on several devices from duplicating seeds.
 * Never throws — a device that starts offline simply skips seeding (another
 * device, or the next online start, will do it).
 */
export async function initDatabase(): Promise<void> {
  const seed = (async () => {
    const adminCount = await getCountFromServer(adminsCol);
    if (adminCount.data().count === 0) {
      await setDoc(doc(adminsCol, 'default-admin'), {
        name: 'Administrator',
        email: 'admin@gmail.com',
        password: 'admin123',
        created_at: new Date().toISOString(),
      });
    }

    const appCount = await getCountFromServer(triggerAppsCol);
    if (appCount.data().count === 0) {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      DEFAULT_APPS.forEach((app, i) => {
        batch.set(doc(triggerAppsCol, `seed-${i}`), {
          app_name: app.app_name,
          package_name: app.package_name,
          category: app.category,
          enabled: 1,
          created_at: now,
        });
      });
      await batch.commit();
    }
  })();

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 8000));
  await Promise.race([seed.catch(() => {}), timeout]);
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

/** Sort trigger apps the way the SQLite version did: gambling first, A→Z. */
function sortTriggerApps(apps: TriggerApp[]): TriggerApp[] {
  return apps.sort(
    (a, b) =>
      b.category.localeCompare(a.category) || a.app_name.localeCompare(b.app_name)
  );
}

/* ------------------------------ auth ------------------------------- */

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const created = new Date().toISOString();
  const data = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    created_at: created,
  };
  const ref = await addDoc(usersCol, data);

  // Seed per-user settings. The trigger-app list is global (admin-managed).
  await setDoc(doc(userSettingsCol, ref.id), defaultSettings(ref.id));
  return { id: ref.id, ...data };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const snap = await getDocs(
    query(usersCol, where('email', '==', email.trim().toLowerCase()), qLimit(1))
  );
  return snap.empty ? null : withId<User>(snap.docs[0]!);
}

export async function getUserById(id: string): Promise<User | null> {
  const snap = await getDoc(doc(usersCol, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null;
}

export async function getAdminByEmail(email: string): Promise<Admin | null> {
  const snap = await getDocs(
    query(adminsCol, where('email', '==', email.trim().toLowerCase()), qLimit(1))
  );
  return snap.empty ? null : withId<Admin>(snap.docs[0]!);
}

export async function getAdminById(id: string): Promise<Admin | null> {
  const snap = await getDoc(doc(adminsCol, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Admin) : null;
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

function defaultSettings(userId: string): UserSettings {
  return {
    user_id: userId,
    family_member: 'mama',
    family_message:
      'Anak, we believe in you. Every day you choose us over gambling, you give us our future back.',
    countdown_seconds: 900,
    monitoring_granted: 0,
    motivation_photo: '',
  };
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const ref = doc(userSettingsCol, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const defaults = defaultSettings(userId);
    await setDoc(ref, defaults);
    return defaults;
  }
  // Merge over defaults so docs written by older builds stay complete.
  return { ...defaultSettings(userId), ...(snap.data() as Partial<UserSettings>) };
}

export async function updateSettings(
  userId: string,
  patch: {
    family_member: string;
    family_message: string;
    countdown_seconds: number;
    motivation_photo?: string;
  }
): Promise<UserSettings> {
  await getSettings(userId); // ensure the doc exists
  const ref = doc(userSettingsCol, userId);
  const data: Record<string, unknown> = {
    family_member: patch.family_member,
    family_message: patch.family_message,
    countdown_seconds: patch.countdown_seconds,
  };
  if (patch.motivation_photo !== undefined) {
    data.motivation_photo = patch.motivation_photo;
  }
  await updateDoc(ref, data);
  return getSettings(userId);
}

/** Save just the friction-popup photo uri (used by the setup-motivation step). */
export async function setMotivationPhoto(
  userId: string,
  uri: string
): Promise<void> {
  await getSettings(userId); // ensure the doc exists
  await updateDoc(doc(userSettingsCol, userId), { motivation_photo: uri });
}

export async function setMonitoringGranted(
  userId: string,
  granted: boolean
): Promise<void> {
  await getSettings(userId); // ensure the doc exists
  await updateDoc(doc(userSettingsCol, userId), {
    monitoring_granted: granted ? 1 : 0,
  });
}

/* --------------------- trigger apps (global, admin) ---------------- */

export async function getTriggerApps(): Promise<TriggerApp[]> {
  const snap = await getDocs(triggerAppsCol);
  return sortTriggerApps(snap.docs.map((d) => withId<TriggerApp>(d)));
}

/** Only the enabled apps — what the detector / user side actually watches. */
export async function getEnabledTriggerApps(): Promise<TriggerApp[]> {
  const snap = await getDocs(query(triggerAppsCol, where('enabled', '==', 1)));
  return sortTriggerApps(snap.docs.map((d) => withId<TriggerApp>(d)));
}

/**
 * Live view of the enabled trigger apps. Fires immediately and again whenever
 * the admin changes the list — on ANY device — so user phones re-arm the
 * native monitor without reopening the app.
 */
export function subscribeEnabledTriggerApps(
  onChange: (apps: TriggerApp[]) => void
): Unsubscribe {
  return onSnapshot(
    query(triggerAppsCol, where('enabled', '==', 1)),
    (snap) => onChange(sortTriggerApps(snap.docs.map((d) => withId<TriggerApp>(d)))),
    () => {} // network errors: keep the last known list
  );
}

/**
 * Find an entry already covering this app — same package name (when both have
 * one) or same app name, case-insensitive. `excludeId` skips the entry being
 * edited so it doesn't count as its own duplicate.
 */
export async function findDuplicateTriggerApp(
  appName: string,
  packageName = '',
  excludeId?: string
): Promise<TriggerApp | null> {
  const name = appName.trim().toLowerCase();
  const pkg = packageName.trim().toLowerCase();
  const apps = await getTriggerApps();
  return (
    apps.find(
      (a) =>
        a.id !== excludeId &&
        ((pkg.length > 0 && a.package_name.trim().toLowerCase() === pkg) ||
          a.app_name.trim().toLowerCase() === name)
    ) ?? null
  );
}

/** Add an app to the global list. Returns false (and adds nothing) if an entry
 *  for the same app already exists — the admin can't double-add. */
export async function addTriggerApp(
  appName: string,
  category: Category,
  packageName = ''
): Promise<boolean> {
  if (await findDuplicateTriggerApp(appName, packageName)) return false;
  await addDoc(triggerAppsCol, {
    app_name: appName.trim(),
    package_name: packageName.trim(),
    category,
    enabled: 1,
    created_at: new Date().toISOString(),
  });
  return true;
}

/** Edit an entry. Returns false if the new name/package collides with another
 *  existing entry. */
export async function updateTriggerApp(
  id: string,
  appName: string,
  category: Category,
  packageName = ''
): Promise<boolean> {
  if (await findDuplicateTriggerApp(appName, packageName, id)) return false;
  await updateDoc(doc(triggerAppsCol, id), {
    app_name: appName.trim(),
    package_name: packageName.trim(),
    category,
  });
  return true;
}

export async function deleteTriggerApp(id: string): Promise<void> {
  await deleteDoc(doc(triggerAppsCol, id));
}

export async function toggleTriggerApp(id: string, enabled: boolean): Promise<void> {
  await updateDoc(doc(triggerAppsCol, id), { enabled: enabled ? 1 : 0 });
}

/** The enabled financial apps shown read-only on the main page as "blocked". */
export async function getBlockedEwallets(): Promise<TriggerApp[]> {
  const apps = await getEnabledTriggerApps();
  return apps.filter((a) => a.category === 'financial');
}

/** The enabled gambling/casino apps (PAGCOR list) shown read-only on the main page. */
export async function getBlockedCasinos(): Promise<TriggerApp[]> {
  const apps = await getEnabledTriggerApps();
  return apps.filter((a) => a.category === 'gambling');
}

/* ----------------------- app suggestions (user) -------------------- */

/**
 * A user proposes an app to block; it waits for admin review. The submitter's
 * name/email are denormalized onto the doc so the admin queue can show them
 * without a join.
 */
export async function addSuggestion(
  userId: string,
  appName: string,
  category: Category,
  packageName = ''
): Promise<void> {
  const user = await getUserById(userId);
  await addDoc(suggestionsCol, {
    user_id: userId,
    user_name: user?.name ?? 'Unknown',
    user_email: user?.email ?? '',
    app_name: appName.trim(),
    package_name: packageName.trim(),
    category,
    status: 'pending',
    notified: 0,
    created_at: new Date().toISOString(),
  });
}

/** A user's own suggestions (so they can see status), newest first. */
export async function getUserSuggestions(userId: string): Promise<AppSuggestion[]> {
  const snap = await getDocs(query(suggestionsCol, where('user_id', '==', userId)));
  return snap.docs
    .map((d) => withId<AppSuggestion>(d))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Resolved (approved/rejected) suggestions the user hasn't been notified of yet. */
export async function getUnnotifiedSuggestions(
  userId: string
): Promise<AppSuggestion[]> {
  const mine = await getUserSuggestions(userId);
  return mine.filter((s) => s.status !== 'pending' && !s.notified);
}

/** Mark suggestions as notified so the user isn't told about them again. */
export async function markSuggestionsNotified(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(suggestionsCol, id), { notified: 1 });
  }
  await batch.commit();
}

/** All pending suggestions for the admin review queue, with the submitter name. */
export async function getPendingSuggestions(): Promise<SuggestionWithUser[]> {
  const snap = await getDocs(query(suggestionsCol, where('status', '==', 'pending')));
  return snap.docs
    .map((d) => withId<SuggestionWithUser>(d))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function countPendingSuggestions(): Promise<number> {
  const snap = await getCountFromServer(
    query(suggestionsCol, where('status', '==', 'pending'))
  );
  return snap.data().count;
}

/** Approve a suggestion: copy it into the global trigger list, mark approved.
 *  If the app is already on the list (e.g. two users suggested it, or the
 *  admin added it manually), nothing is duplicated — the suggestion is simply
 *  marked approved, since the app IS being blocked. */
export async function approveSuggestion(id: string): Promise<void> {
  const ref = doc(suggestionsCol, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const s = snap.data() as AppSuggestion;
  await addTriggerApp(s.app_name, s.category, s.package_name); // no-op when already listed
  await updateDoc(ref, { status: 'approved' });
}

export async function rejectSuggestion(id: string): Promise<void> {
  await updateDoc(doc(suggestionsCol, id), { status: 'rejected' });
}

/* ----------------------------- admin stats ------------------------- */

export async function getAdminStats(): Promise<AdminStats> {
  const [users, apps, totals] = await Promise.all([
    getCountFromServer(usersCol),
    getCountFromServer(triggerAppsCol),
    getAggregateFromServer(dailyLogsCol, {
      g: sum('gambling_count'),
      r: sum('resisted_count'),
    }),
  ]);
  return {
    totalUsers: users.data().count,
    triggerAppCount: apps.data().count,
    totalGamblingAttempts: totals.data().g,
    totalResisted: totals.data().r,
  };
}

/* ----------------------------- events ------------------------------ */

/**
 * Record the outcome of a detected access attempt.
 * Per the spec, a gambling 'proceeded' attempt increments the daily count +1.
 */
export async function recordEvent(input: {
  userId: string;
  appName: string;
  category: Category;
  action: EventAction;
}): Promise<void> {
  const day = todayKey();
  const now = new Date().toISOString();

  await addDoc(accessEventsCol, {
    user_id: input.userId,
    app_name: input.appName,
    category: input.category,
    action: input.action,
    day,
    created_at: now,
  });

  const isGambling = input.category === 'gambling';
  const gambled = input.action === 'proceeded' && isGambling ? 1 : 0;
  const resisted = input.action === 'resisted' ? 1 : 0;

  // Deterministic per-user-per-day doc id makes the upsert + increment atomic.
  await setDoc(
    doc(dailyLogsCol, `${input.userId}_${day}`),
    {
      user_id: input.userId,
      day,
      gambling_count: increment(gambled),
      resisted_count: increment(resisted),
    },
    { merge: true }
  );
}

/**
 * Log that an app was opened, regardless of whether it is on the trigger list.
 * Non-trigger apps are recorded with category 'other' and action 'opened'
 * (no counters change) — this is how the activity log captures every app.
 */
export async function recordAppOpen(
  userId: string,
  appName: string,
  category: Category = 'other'
): Promise<void> {
  return recordEvent({ userId, appName, category, action: 'opened' });
}

export async function getDailyLogs(userId: string, limit = 30): Promise<DailyLog[]> {
  const snap = await getDocs(query(dailyLogsCol, where('user_id', '==', userId)));
  return snap.docs
    .map((d) => withId<DailyLog>(d))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, limit);
}

export async function getRecentEvents(
  userId: string,
  limit = 50
): Promise<AccessEvent[]> {
  const snap = await getDocs(
    query(
      accessEventsCol,
      where('user_id', '==', userId),
      orderBy('created_at', 'desc'),
      qLimit(limit)
    )
  );
  return snap.docs.map((d) => withId<AccessEvent>(d));
}

/**
 * Permanently delete a single user's activity history
 * (daily rollups + individual events). Settings and account are untouched.
 */
export async function clearUserLogs(userId: string): Promise<void> {
  for (const col of [accessEventsCol, dailyLogsCol]) {
    const snap = await getDocs(query(col, where('user_id', '==', userId)));
    // Firestore batches cap at 500 ops.
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }
  }
}

/* --------------------------- derived stats ------------------------- */

export async function getStats(userId: string): Promise<Stats> {
  const [logsSnap, blockedSnap, user] = await Promise.all([
    getDocs(query(dailyLogsCol, where('user_id', '==', userId))),
    // "Urges blocked": every time a casino/gambling app was opened and the
    // reminder stepped in (whether the user resisted or proceeded).
    getCountFromServer(
      query(
        accessEventsCol,
        where('user_id', '==', userId),
        where('category', '==', 'gambling'),
        where('action', 'in', ['resisted', 'proceeded'])
      )
    ),
    getUserById(userId),
  ]);

  const logs = logsSnap.docs
    .map((d) => withId<DailyLog>(d))
    .sort((a, b) => b.day.localeCompare(a.day));

  const totalResisted = logs.reduce((n, l) => n + (l.resisted_count || 0), 0);
  const totalGambling = logs.reduce((n, l) => n + (l.gambling_count || 0), 0);
  const urgesBlocked = blockedSnap.data().count;

  // Bet-free streak: consecutive days (ending today) with zero gambling attempts.
  const map = new Map(logs.map((l) => [l.day, l.gambling_count]));

  // Cap the streak at the account's signup day — you can't be bet-free before
  // you started using the app. Without this, days with no log default to 0
  // gambling and every prior day (up to a year) counts as bet-free, so a brand
  // new account immediately shows a misleadingly large, fixed-looking number.
  const signupKey = user ? todayKey(new Date(user.created_at)) : todayKey();

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
    longestStreakWeeks: Math.floor(longest / 7),
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
