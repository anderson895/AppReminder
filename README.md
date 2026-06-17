# BetFree

A gambling-app reminder mobile application built with **Expo (React Native) + TypeScript**,
**expo-router**, **React Native Paper**, and **Cloud Firestore** (online backend).

BetFree asks you to pause before opening gambling and financial apps (GCash, Maya, etc.).
Before access is granted it shows a friction reminder — a message from a loved one — and a
countdown timer, then logs every detected attempt under your account.

## Features

- **Login & registration** — accounts stored in **Cloud Firestore**, so the same account and
  trigger-app list are shared across every device; reminder features activate only after
  sign-in. Registration requires agreeing to the **Terms and Conditions**.
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
  - Trigger apps are matched by **package name**, so only **real, store-installed apps**
    (which have a stable package name across devices) work as triggers. Chrome
    WebAPKs / PWAs ("Add to Home Screen" websites) have a per-device random package
    name (`org.chromium.webapk.<hash>`), so they would only ever match the admin's own
    phone — these are **filtered out of the installed-app picker**. Website-only gambling
    that opens in a browser tab can't be caught by package-name detection.
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
| Backend / data | Cloud Firestore (online)          |

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
  db/firebase.ts     # Firebase app + Firestore init
  db/database.ts     # Firestore collections + typed queries
  context/AuthContext.tsx
  components/ui.tsx  # PrimaryButton, OutlineButton, StatTile, BrandHeader
```

## Real app detection (native)

Detection runs for real via a local Expo native module (`modules/app-detector`, Kotlin):
a foreground `Service` polls `UsageStatsManager` to learn which app is in the foreground.
When a watched (trigger) app opens, BetFree brings up a full-screen **`ReminderActivity`
friction card** over it (with "I don't need to open this" / "continue" buttons — it does not
hard-block the app). The watched app is merely backgrounded, so there's no overlay for
banking apps (e.g. GCash) to flag as tap-jacking. To satisfy the Android 14+
background-activity-launch rule, the service briefly adds a 1×1 transparent overlay
(`SYSTEM_ALERT_WINDOW`) just long enough to launch the activity. If the overlay permission
isn't granted it falls back to a **heads-up notification**. No accessibility service is used,
so it installs without the Play Protect block. This requires a **dev/standalone build**
(not Expo Go) and the user grants **Usage access** + **Display over other apps**.

> **Fully online:** all app data (accounts, the global trigger-app list, suggestions, and
> activity logs) lives in **Cloud Firestore**, so whatever the admin blocks reflects on every
> user's device. Firebase config is supplied via `EXPO_PUBLIC_FIREBASE_*` environment
> variables (`.env` locally; EAS environment variables for builds).
