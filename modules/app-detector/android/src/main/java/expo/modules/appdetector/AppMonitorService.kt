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
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings

/**
 * Foreground service that polls UsageStats to learn which app is in the
 * foreground. Every detected app-open is buffered (Prefs); if it matches a
 * trigger app, BettrMind launches a full-screen [ReminderActivity] friction
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
   * Bring up [ReminderActivity] over the watched app. Starting an activity from
   * a background service is normally blocked on Android 10+, but holding
   * SYSTEM_ALERT_WINDOW grants the background-activity-launch exemption — so we
   * require that permission and otherwise fall back to the notification.
   */
  private fun launchReminderActivity(block: TriggerHandler.Block): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      return false
    }
    return try {
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
      startActivity(i)
      true
    } catch (e: Exception) {
      false
    }
  }

  /* --------------------------- notification fallback ------------------------ */

  /**
   * Fallback when the reminder activity can't be launched (overlay permission
   * not granted): a heads-up reminder notification. Stashes the trigger so
   * tapping it opens BettrMind to the reminder/countdown screen (consumed via
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
      monitor.description = "BettrMind watches for gambling and financial apps"
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
      .setContentTitle("BettrMind is active")
      .setContentText("Watching for gambling & financial apps")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .build()
  }
}
