# Google Play Store Requirements — BetFree

Checklist at requirements bago i-upload ang **BetFree** sa Google Play Store.

**App details (as of latest build):**

| Item | Value |
|---|---|
| App name | BetFree |
| Package name | `com.bettrmind.app` (permanent — hindi na mababago pagka-upload) |
| Version | 1.0.0 (versionCode 1, auto-increment sa production builds) |
| Target SDK | 36 ✅ (pasok sa Play requirement) |
| Expo SDK | 54 |
| EAS project | `bettrmind` (owner: `ardeleonpoultrysupplies`) |

---

## 1. Build na dapat i-upload (AAB, hindi APK)

Ang Play Store ay tumatanggap lang ng **Android App Bundle (.aab)**, hindi ang preview APK.

```bash
eas build --platform android --profile production
```

Ang `production` profile sa `eas.json` ay naka-configure na:
- `buildType: app-bundle` ✅
- `autoIncrement: true` (versionCode awtomatikong tumataas kada build) ✅
- EAS ang nag-ma-manage ng signing keystore; sa Play Console, i-enroll sa **Play App Signing** (default na ito sa bagong apps) ✅

---

## 2. Permissions — mga kailangang i-declare o i-justify

Kasalukuyang permissions sa APK:

| Permission | Status sa Play review |
|---|---|
| `PACKAGE_USAGE_STATS` | ⚠️ **RESTRICTED** — kailangan ng declaration form (see below) |
| `SYSTEM_ALERT_WINDOW` | ⚠️ **High scrutiny** — kailangan ng malinaw na justification (see below) |
| `CAMERA` | ⚠️ Hindi kailangan (photo picker lang ang gamit) — **dapat i-block** |
| `READ/WRITE_EXTERNAL_STORAGE` | ⚠️ Deprecated/legacy — **dapat i-block** kung kaya |
| `POST_NOTIFICATIONS` | ✅ OK — normal runtime permission |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` | ⚠️ Kailangan ng foreground service type declaration sa Play Console (special use → may text justification) |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` | ✅ OK — walang review |

### 2a. PACKAGE_USAGE_STATS declaration (Usage Access)

Sa Play Console → App content → **Sensitive permissions declaration**:

- **Core purpose:** Digital wellbeing / self-control app. Dine-detect ng BetFree kapag binuksan ng user ang gambling/e-wallet apps na *siya mismo ang pumili* para ipakita ang isang reminder na siya rin ang nag-set up, bilang tulong sa pag-iwas sa sugal.
- I-emphasize na: (1) opt-in at may consent flow, (2) hindi kino-collect o ipinapadala ang data kahit saan — **fully offline ang app, walang network calls**, (3) ang usage data ay ginagamit lang locally para i-trigger ang reminder.
- Kategorya na pinaka-malapit: "Digital wellbeing" use case — ito ang allowed category ni Google para sa usage access.

> ⚠️ Realistic expectation: madalas i-reject ni Google ang unang submission ng apps na may usage access. Maghanda ng appeal na may screenshots ng consent flow at paliwanag ng core feature.

### 2b. SYSTEM_ALERT_WINDOW (Display over other apps)

- Ginagamit para sa 1×1 BAL-primer overlay na nagla-launch ng full-screen `ReminderActivity` (Android 14+ requirement para sa background activity launch).
- **Pinakamalaking rejection risk.** Ang pop-up habang nasa ibang app (hal. GCash) ay puwedeng i-flag as "disruptive behavior" o ad-like interstitial.
- Justification na gagamitin: ang overlay ay invisible 1×1 technical primer lang; ang full-screen reminder ay core feature na in-enable ng user mismo (self-imposed intervention), hindi ads, at may "Proceed anyway" option (hindi nito hinaharangan ang ibang app).

### 2c. I-block ang hindi kailangang permissions

Sa `app.json` → `expo.android.blockedPermissions`, idagdag:

```json
"blockedPermissions": [
  "android.permission.RECORD_AUDIO",
  "android.permission.CAMERA",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE"
]
```

(Ang photo picking ay gumagana pa rin via system photo picker nang walang storage/camera permission sa Android 13+.) Pagkatapos baguhin, mag-build ulit at i-verify gamit ang `aapt dump badging` na wala na ang mga ito.

---

## 3. Play Console — App content (required bago maka-publish)

- [ ] **Privacy policy URL** — required kahit offline ang app. Kailangan ng publicly hosted page (puwedeng GitHub Pages / Google Sites). Dapat banggitin: walang data na kino-collect o ipinapadala; lahat ng data ay naka-store locally (SQLite) sa device.
- [ ] **Data Safety form** — i-declare na: *No data collected, no data shared*. (Totoo ito — walang Firebase, walang analytics, walang network calls.)
- [ ] **Content rating questionnaire** (IARC) — sagutin nang tapat. Note: ang app ay *anti*-gambling tool, hindi gambling app; walang real-money gaming. Expected rating: Everyone/3+ o Teen depende sa sagot tungkol sa gambling references.
- [ ] **Target audience & content** — adults (18+) ang target dahil gambling-recovery ang tema; hindi ito for children.
- [ ] **Ads declaration** — No ads.
- [ ] **Sensitive permissions declaration** — usage access + overlay (see section 2).
- [ ] **Foreground service declaration** — special use type, ilagay ang justification ng app-detection service.
- [ ] **App category** — Health & Fitness o Lifestyle (suggested: Health & Fitness, "digital wellbeing").

---

## 4. Store listing assets

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, ≤1 MB | Gawin mula sa `assets/icon.png` (1024×1024 na ito — i-resize lang) |
| Feature graphic | 1024×500 JPG/PNG | ❌ Wala pa — kailangang gawin |
| Phone screenshots | Min 2, 16:9 o 9:16, min 320px | ❌ Wala pa — kunan ang Home, Reminder pop-up, Settings, Consent flow |
| Short description | ≤80 chars | hal. *"Break the gambling cycle. BetFree reminds you before you bet."* |
| Full description | ≤4000 chars | Isulat: ano ang app, paano gumagana ang reminder, privacy (offline, no data collection) |

---

## 5. Developer account

- [ ] Google Play Developer account — **$25 one-time fee**
- [ ] Identity verification (required na ngayon para sa personal accounts)
- [ ] Para sa personal accounts na gawa pagkatapos ng Nov 2023: **closed testing requirement** — kailangan ng 12 testers na tuloy-tuloy na naka-opt-in sa closed test nang 14 days bago payagang mag-production release

---

## 6. Submission flow (recommended order)

1. Ayusin ang blocked permissions (section 2c) → production build (`eas build -p android --profile production`)
2. Gumawa/i-host ang privacy policy
3. Setup ng Play Console listing + lahat ng App content forms
4. I-upload ang AAB sa **Internal testing** muna — i-verify ang icon, name, at reminder flow sa Play-delivered build
5. Closed testing (14 days / 12 testers kung personal account)
6. Production release — maghanda para sa posibleng rejection sa usage-access/overlay permissions; mag-appeal with justification + consent-flow screenshots

Optional na automation pagkatapos ma-setup ang Console:

```bash
eas submit --platform android --profile production
```

(Kailangan ng Google Service Account JSON key na naka-link sa Play Console.)

---

## Mga risk na dapat asahan

1. **Usage access + overlay combo** — ito ang dalawang pinaka-fla-flag na permissions; ang depensa ay ang malinaw na digital-wellbeing purpose, opt-in consent flow, at zero data collection.
2. **Gambling references sa listing** — OK ang anti-gambling apps, pero iwasang gumamit ng gambling imagery/branding ng totoong apps (hal. GCash logo) sa screenshots.
3. **Package name** — `com.bettrmind.app` ang mananatiling package name forever (kahit "BetFree" na ang brand). Kung gusto pang palitan to `com.betfree.app`, **ngayon na ang huling pagkakataon** — bago ang unang upload. Pagka-upload, permanent na.
