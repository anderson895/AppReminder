# SafeWallet

A gambling-app reminder mobile application built with **Expo (React Native) + TypeScript**,
**expo-router**, **React Native Paper**, and **SQLite (expo-sqlite)**.

SafeWallet asks you to pause before opening gambling and financial apps (GCash, Maya, etc.).
Before access is granted it shows a friction reminder — a message from a loved one — and a
countdown timer, then logs every detected attempt under your account.

## Features

- **Login & registration** — accounts stored locally in SQLite; reminder features activate
  only after sign-in.
- **Monitored apps** — gambling (Online Casino, Sports Betting, eBingo) and financial
  (GCash, Maya, GrabPay) apps; each can be toggled on/off.
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
| Framework      | Expo SDK 55 (React Native 0.85)   |
| Language       | TypeScript (strict)               |
| Navigation     | expo-router (file-based)          |
| UI             | React Native Paper + custom theme |
| Local database | expo-sqlite (async API)           |

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

## Note on real-world app detection

Truly detecting when **other** apps are launched on Android requires native Android APIs
(`UsageStatsManager` or an `AccessibilityService`) that run outside the standard Expo Go /
managed workflow. To keep the project runnable end-to-end, detection is exercised in-app:

- the dashboard's **open e-wallet** button, and
- the **test** buttons on the *monitored apps* screen

simulate the system detecting an app launch and trigger the full reminder → countdown →
logging flow. The background native monitor can be added later via an Expo **dev build** /
config plugin without changing the rest of the app.
