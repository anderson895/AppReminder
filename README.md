# BettrMind

A gambling-app reminder mobile application built with **Expo (React Native) + TypeScript**,
**expo-router**, **React Native Paper**, and **SQLite (expo-sqlite)**.

BettrMind asks you to pause before opening gambling and financial apps (GCash, Maya, etc.).
Before access is granted it shows a friction reminder — a message from a loved one — and a
countdown timer, then logs every detected attempt under your account.

## Features

- **Login & registration** — accounts stored locally in SQLite; reminder features activate
  only after sign-in. Registration requires agreeing to the **Terms and Conditions**.
- **Monitoring consent** — after registering or logging in, users are taken to a
  permission screen that explains and requests app-monitoring access (Usage access +
  Display over other apps). In Expo Go this records in-app consent; in a native dev build
  it deep-links to the real Android permission screens. A dashboard banner appears while
  monitoring is off.
- **Admin account** — a separate admin role manages the **global trigger-app list**
  (add / edit / delete / enable) that applies to every user, plus an overview of total
  users and gambling hits. Regular users see this list read-only.
  - Default admin: **`admin@gmail.com`** / **`admin123`** (seeded on first launch;
    log in on the normal login screen).
- **Monitored apps** — gambling (Online Casino, Sports Betting, eBingo) and financial
  (GCash, Maya, GrabPay) apps, defined centrally by the admin.
- **Friction pop-up** — a personal message ("from mama") shown before a monitored app opens,
  matching the reference design.
- **Countdown timer** — a configurable waiting period (5–60s) before access is granted.
- **Daily activity logs** — each detected gambling access that proceeds increments that day's
  `gambling_count` (+1); resisted urges are tracked too.
- **Dashboard** — bet-free streak, money-not-gambled estimate, urges resisted, longest streak.
- **Settings** — customise the reminder message, sender, pause length, and bet amount.

## Tech stack

| Concern        | Choice                            |
| -------------- | --------------------------------- |
| Framework      | Expo SDK 54 (React Native 0.81)   |
| Language       | TypeScript (strict)               |
| Navigation     | expo-router v6 (file-based)       |
| UI             | React Native Paper + custom theme |
| Local database | expo-sqlite (async API)           |

> Targets **Expo SDK 54** so it runs in the current Expo Go client (SDK 54).

## Getting started

```bash
npm install
npx expo start
```

Then press **a** for an Android emulator/device (with Expo Go or a dev build), or scan the QR
code with the Expo Go app.

## Project structure

```
app/                 # expo-router routes
  _layout.tsx        # providers (Paper, Auth), DB init, stack config
  index.tsx          # auth redirect
  login.tsx / register.tsx
  dashboard.tsx      # home screen (reference Image #1)
  reminder.tsx       # friction pop-up (reference Image #2)
  countdown.tsx      # waiting-period timer + access granted
  apps.tsx           # monitored apps / detection simulator
  journal.tsx        # daily logs + recent events
  settings.tsx       # message + pause configuration
src/
  theme.ts           # design tokens from the reference mockups
  types.ts           # shared domain types
  db/database.ts     # SQLite schema + typed queries
  context/AuthContext.tsx
  components/ui.tsx  # PrimaryButton, OutlineButton, StatTile, BrandHeader
```

## Real app detection (native)

Detection runs for real via a local Expo native module (`modules/app-detector`, Kotlin):
a foreground `Service` polls `UsageStatsManager` to learn which app is in the foreground,
and a system overlay (`SYSTEM_ALERT_WINDOW`) draws the reminder + countdown on top of the
opened app (locked to portrait). This requires a **dev/standalone build** (not Expo Go) and
the user must grant **Usage access** + **Display over other apps**.

---

## Firebase remote kill-switch (developer)

The app ships **offline** (all user data is local SQLite), but checks one Firebase flag on
launch/resume so the developer can **remotely disable** the app (e.g. if the client does not
pay). This is already configured for project **`bettrmind-ba10a`**.

**How it works**

- On launch and on app-resume the app does a plain `fetch` to the **Firestore REST API** for
  the document **`config/app`** and reads `{ enabled: bool, message: string }`
  (`src/remoteGate.ts`).
- If `enabled === false`, the whole app shows a **lock screen** and native monitoring stops.
- The status is cached (AsyncStorage). A device that has **never reached Firebase defaults to
  enabled** (offline first-run works); once it has seen `disabled` it **stays locked even
  offline**. Network/missing-doc failures never lock the app.
- No Firebase SDK is used — REST + `fetch` only, so it stays light and OTA-compatible.

**What is already set up** (in this project)

- Firestore `(default)` database with document `config/app` → `enabled: true`,
  `message: "This application has been disabled. Please contact the developer to restore access."`
- Security rules (`firestore.rules`, deployed): the flag is **publicly readable** but
  **write-denied** — only the developer can change it. Config lives in `firebase.json` /
  `.firebaserc`.

**To LOCK or UNLOCK the app**

1. Open the [Firebase console](https://console.firebase.google.com/project/bettrmind-ba10a/firestore)
   → **Firestore Database** → `config` → `app`.
2. Set **`enabled`** to **`false`** to lock (optionally edit `message`), or **`true`** to
   unlock.
3. The change applies the next time the client's app is opened **with internet** (and then
   persists offline).

**Re-deploying the rules** (only if changed):

```bash
firebase deploy --only firestore:rules --project bettrmind-ba10a
```

> **Deliverable note:** the kill-switch must be in the **embedded JS bundle** of the APK you
> hand over, so build the final APK with `eas build -p android --profile preview` (an OTA
> update only patches already-installed copies). The embedded `apiKey` is a public Firebase
> web key — safe to ship; it cannot change the flag because writes are denied by rules.
