package expo.modules.appdetector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager

/**
 * Foreground service that polls UsageStats to learn which app is in the
 * foreground. Every detected app-open is buffered (Prefs); if it matches a
 * trigger app, BetFree launches a full-screen [ReminderActivity] friction
 * card. The card has "I don't need to open this" / "continue" buttons; it never
 * hard-blocks the app. When the activity can't be launched (no overlay
 * permission, so no background-activity-launch exemption) it falls back to a
 * heads-up notification.
 *
 * The reminder used to be a SYSTEM_ALERT_WINDOW overlay drawn over the watched
 * app, but banking apps (e.g. GCash) detect overlays on top of them as a
 * tap-jacking risk and block their own screen. A full-screen Activity takes the
 * foreground instead — the watched app is merely backgrounded — so there's no
 * overlay for them to flag.
 */
class AppMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastEventTime = 0L

  // A 1x1, transparent overlay added just long enough to satisfy the Android 14+
  // background-activity-launch check (see launchReminderActivity).
  private var balOverlay: View? = null

  companion object {
    const val CHANNEL_ID = "bettrmind_monitor"
    const val REMINDER_CHANNEL_ID = "bettrmind_reminder"
    const val NOTIF_ID = 7321
    const val REMINDER_NOTIF_ID = 7322
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
    removeBalOverlay()
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

    val pkg = latest ?: return
    TriggerHandler.evaluate(this, pkg)?.let { remind(it) }
  }

  /** Launch the full-screen friction card; fall back to a notification if it
   *  can't be started. */
  private fun remind(block: TriggerHandler.Block) {
    if (launchReminderActivity(block)) return
    notifyReminder(block)
  }

  /**
   * Bring up [ReminderActivity] over the watched app.
   *
   * Starting an activity from a background foreground-service is blocked by the
   * Android 14+ background-activity-launch (BAL) rules. Holding
   * SYSTEM_ALERT_WINDOW is no longer enough on its own — the launching UID must
   * have an *actually-visible* overlay window at launch time
   * (`hasNonAppVisibleWindow`). So we briefly add a 1x1 transparent overlay to
   * satisfy that check, fire the activity, then remove the overlay once it's up.
   * The activity (not this window) renders the UI, so the watched app has no
   * overlay to detect. Note: a BAL block is silent (no exception), so we can't
   * detect it here — we gate solely on the overlay permission and otherwise let
   * the activity come up.
   */
  private fun launchReminderActivity(block: TriggerHandler.Block): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      return false
    }
    val i = Intent(this, ReminderActivity::class.java).apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_NO_ANIMATION
      )
      putExtra(ReminderActivity.EXTRA_PKG, block.pkg)
      putExtra(ReminderActivity.EXTRA_APP_NAME, block.appName)
      putExtra(ReminderActivity.EXTRA_CATEGORY, block.category)
    }

    addBalOverlay()
    // Give the overlay a frame to actually become visible before the system
    // evaluates the BAL check, then launch and tear the overlay back down.
    handler.postDelayed({
      try {
        startActivity(i)
      } catch (e: Exception) {
        // ignore — the notification path isn't reachable from here since a BAL
        // block doesn't throw; permission was already verified above
      }
      handler.postDelayed({ removeBalOverlay() }, 1500)
    }, 150)
    return true
  }

  /** Add the tiny transparent overlay that unlocks background-activity-launch. */
  private fun addBalOverlay() {
    if (balOverlay != null) return
    try {
      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      val lp = WindowManager.LayoutParams(
        1, 1, type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT
      )
      val v = View(this)
      wm.addView(v, lp)
      balOverlay = v
    } catch (e: Exception) {
      balOverlay = null
    }
  }

  private fun removeBalOverlay() {
    val v = balOverlay ?: return
    balOverlay = null
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v)
    } catch (e: Exception) {
      // already detached
    }
  }

  /* --------------------------- notification fallback ------------------------ */

  /**
   * Fallback when the reminder activity can't be launched (overlay permission
   * not granted): a heads-up reminder notification. Stashes the trigger so
   * tapping it opens BetFree to the reminder/countdown screen (consumed via
   * consumeLaunchTrigger).
   */
  private fun notifyReminder(block: TriggerHandler.Block) {
    Prefs.setLaunchTrigger(this, block.pkg, block.appName, block.category)

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      putExtra("bettrmind_open_reminder", true)
    }
    val pi = launch?.let {
      PendingIntent.getActivity(
        this,
        REMINDER_NOTIF_ID,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    val member = Prefs.getReminderMember(this)
    val message = Prefs.getReminderMessage(this)
    val body = if (member.isNotBlank()) "$message — $member" else message

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, REMINDER_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH)
    }
    builder
      .setContentTitle("You opened ${block.appName}")
      .setContentText(message)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
    if (pi != null) builder.setContentIntent(pi)

    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(REMINDER_NOTIF_ID, builder.build())
  }

  /* ------------------------- foreground service plumbing -------------------- */

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

      val monitor = NotificationChannel(
        CHANNEL_ID,
        "App monitoring",
        NotificationManager.IMPORTANCE_LOW
      )
      monitor.description = "BetFree watches for gambling and financial apps"
      nm.createNotificationChannel(monitor)

      // High importance so the fallback reminder shows as a heads-up banner.
      val reminder = NotificationChannel(
        REMINDER_CHANNEL_ID,
        "Reminders",
        NotificationManager.IMPORTANCE_HIGH
      )
      reminder.description = "Shown when you open a watched app"
      nm.createNotificationChannel(reminder)
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
      .setContentTitle("BetFree is active")
      .setContentText("Watching for gambling & financial apps")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .build()
  }
}
