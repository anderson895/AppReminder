package expo.modules.appdetector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.graphics.PixelFormat
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * Foreground service that polls UsageStats to learn which app is in the
 * foreground. Every detected app-open is buffered (Prefs); if it matches a
 * trigger app, BettrMind is brought to the front to show the reminder.
 */
class AppMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastPackage: String? = null
  private var lastEventTime = 0L
  private var triggers = JSONArray()

  // A 1x1 invisible overlay kept alive while monitoring. Android 12+ blocks
  // background Activity launches ("BAL") even for a foreground service that
  // merely HOLDS the overlay permission — the BAL check requires an actually
  // VISIBLE non-app window (callingUidHasNonAppVisibleWindow). Keeping this tiny
  // overlay present satisfies that, so BlockerActivity can launch over a trigger
  // app from the background. Invisible (1px, transparent, untouchable) so the
  // user never sees it; not the reminder UI itself, so apps that hide overlays
  // (GCash/Maya's setHideOverlayWindows) can't defeat the full-screen blocker.
  private var balPrimer: View? = null

  companion object {
    const val CHANNEL_ID = "bettrmind_monitor"
    const val NOTIF_ID = 7321
    const val POLL_MS = 800L
  }

  private val poll = object : Runnable {
    override fun run() {
      try {
        checkForeground()
      } catch (e: Exception) {
        // keep polling even if one read fails
      }
      handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val appsJson = intent?.getStringExtra("apps") ?: Prefs.getTriggers(this)
    Prefs.setTriggers(this, appsJson)
    triggers = try {
      JSONArray(appsJson)
    } catch (e: Exception) {
      JSONArray()
    }

    createChannel()
    startInForeground()
    addBalPrimer()
    Prefs.setMonitoring(this, true)

    lastEventTime = System.currentTimeMillis() - 60_000L
    handler.removeCallbacks(poll)
    handler.post(poll)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(poll)
    removeBalPrimer()
    Prefs.setMonitoring(this, false)
    super.onDestroy()
  }

  /** Add the invisible BAL-priming overlay (see [balPrimer]). No-op if the
   *  overlay permission isn't granted or the window is already present. */
  private fun addBalPrimer() {
    if (balPrimer != null) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return
    try {
      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      val lp = WindowManager.LayoutParams(
        1,
        1,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
        PixelFormat.TRANSLUCENT
      )
      lp.gravity = Gravity.TOP or Gravity.START
      val v = View(this)
      wm.addView(v, lp)
      balPrimer = v
    } catch (e: Exception) {
      balPrimer = null
    }
  }

  private fun removeBalPrimer() {
    val v = balPrimer ?: return
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v)
    } catch (e: Exception) {
      // already gone
    }
    balPrimer = null
  }

  private fun checkForeground() {
    val usm = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return
    val now = System.currentTimeMillis()
    val events = usm.queryEvents(lastEventTime, now)
    val event = UsageEvents.Event()
    var latest: String? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
        latest = event.packageName
      }
    }
    lastEventTime = now

    if (latest == packageName) {
      // The user is inside BettrMind itself (e.g. un-muting an app in Settings).
      // Forget the last package so the very next trigger-app open is always
      // re-evaluated — otherwise returning straight to a just-used app (e.g.
      // un-mute Maya, then reopen Maya) would be deduped and skip the reminder.
      lastPackage = null
    } else if (latest != null && latest != lastPackage) {
      lastPackage = latest
      onAppOpened(latest!!)
    }
  }

  private fun onAppOpened(pkg: String) {
    val lower = pkg.lowercase()
    if (lower.contains("launcher") ||
      pkg == "com.android.systemui" ||
      lower.contains("inputmethod")
    ) {
      return
    }

    var match: JSONObject? = null
    for (i in 0 until triggers.length()) {
      val t = triggers.optJSONObject(i) ?: continue
      val tp = t.optString("packageName")
      if (tp.isNotEmpty() && tp == pkg) {
        match = t
        break
      }
    }

    val appName = match?.optString("appName") ?: getAppLabel(pkg) ?: pkg
    val category = match?.optString("category") ?: "other"
    val isTrigger = match != null

    if (!isTrigger) {
      // Non-trigger app: just log the open.
      Prefs.addPending(this, pkg, appName, category, false, "opened")
      return
    }

    // "Don't show again": user muted this app — log the open, no reminder.
    if (Prefs.isMuted(this, pkg)) {
      Prefs.addPending(this, pkg, appName, category, true, "opened")
      return
    }

    // Log the open now, in the service, so it ALWAYS appears in the activity
    // feed — independent of whether the blocker UI manages to show. (Previously
    // the open was only logged inside BlockerActivity, so if the activity launch
    // was blocked — e.g. by Background Activity Launch restrictions — the open
    // vanished from the logs while non-trigger opens still showed.) The reminder
    // outcome ('resisted'/'proceeded') is logged separately by BlockerActivity.
    Prefs.addPending(this, pkg, appName, category, true, "opened")

    // Trigger app: launch the full-screen blocker activity over it. Starting an
    // activity from the background is permitted here because the app holds the
    // SYSTEM_ALERT_WINDOW permission. An activity (vs. an overlay) can't be
    // hidden by security-hardened apps like GCash.
    val canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
      Settings.canDrawOverlays(this)
    if (canOverlay) {
      try {
        val intent = Intent(this, BlockerActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          .putExtra("packageName", pkg)
          .putExtra("appName", appName)
          .putExtra("category", category)
        startActivity(intent)
      } catch (e: Exception) {
        // Background activity start blocked — fall back to the in-app reminder.
        Prefs.setLaunchTrigger(this, pkg, appName, category)
        launchReminder()
      }
    } else {
      // No overlay permission — fall back to the in-app reminder screen.
      Prefs.setLaunchTrigger(this, pkg, appName, category)
      launchReminder()
    }
  }

  private fun getAppLabel(pkg: String): String? = try {
    val pm = packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
  } catch (e: Exception) {
    null
  }

  private fun launchReminder() {
    try {
      val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      launch.putExtra("bettrmind_open_reminder", true)
      startActivity(launch)
    } catch (e: Exception) {
      // Background activity start may be blocked without overlay permission;
      // the open is still buffered and will appear in the activity logs.
    }
  }

  private fun startInForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(
        NOTIF_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        CHANNEL_ID,
        "App monitoring",
        NotificationManager.IMPORTANCE_LOW
      )
      channel.description = "BettrMind watches for gambling and financial apps"
      nm.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle("BettrMind is active")
      .setContentText("Watching for gambling & financial apps")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .build()
  }
}
