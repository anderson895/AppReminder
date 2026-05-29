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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
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
  private val overlay by lazy { OverlayManager(this) }

  companion object {
    const val CHANNEL_ID = "bettrmind_monitor"
    const val NOTIF_ID = 7321
    const val POLL_MS = 1500L
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
    Prefs.setMonitoring(this, true)

    lastEventTime = System.currentTimeMillis() - 60_000L
    handler.removeCallbacks(poll)
    handler.post(poll)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(poll)
    Prefs.setMonitoring(this, false)
    super.onDestroy()
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

    if (latest != null && latest != lastPackage && latest != packageName) {
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

    // Trigger app: show the reminder overlay on top of it.
    val canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
      Settings.canDrawOverlays(this)
    if (canOverlay) {
      val member = Prefs.getReminderMember(this)
      val message = Prefs.getReminderMessage(this)
      val seconds = Prefs.getReminderSeconds(this)
      overlay.show(appName, pkg, member, message, seconds) { action ->
        if (action == "muted") {
          Prefs.addMuted(this, pkg)
          Prefs.addPending(this, pkg, appName, category, true, "opened")
        } else {
          Prefs.addPending(this, pkg, appName, category, true, action)
        }
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
