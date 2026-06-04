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
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Foreground service that polls UsageStats to learn which app is in the
 * foreground. Every detected app-open is buffered (Prefs); if it matches a
 * trigger app, BettrMind shows a reminder pop-up card drawn as an overlay over
 * the app (no Activity, no accessibility — just SYSTEM_ALERT_WINDOW). The card
 * has "Not now" / "Continue anyway" buttons; it never hard-blocks the app. When
 * the overlay permission isn't granted, it falls back to a heads-up notification.
 */
class AppMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastEventTime = 0L

  private var overlayView: View? = null
  private val dismissOverlay = Runnable { removeOverlay() }

  companion object {
    const val CHANNEL_ID = "bettrmind_monitor"
    const val REMINDER_CHANNEL_ID = "bettrmind_reminder"
    const val NOTIF_ID = 7321
    const val REMINDER_NOTIF_ID = 7322
    const val POLL_MS = 800L
    const val OVERLAY_TIMEOUT_MS = 60_000L
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
    removeOverlay()
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
    // The user switched to a different app — drop any reminder still showing.
    if (overlayView != null && pkg != packageName) removeOverlay()
    TriggerHandler.evaluate(this, pkg)?.let { remind(it) }
  }

  /** Show the pop-up overlay; fall back to a notification if it can't be drawn. */
  private fun remind(block: TriggerHandler.Block) {
    if (showOverlayReminder(block)) return
    notifyReminder(block)
  }

  /* ----------------------------- overlay pop-up ----------------------------- */

  private fun showOverlayReminder(block: TriggerHandler.Block): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      return false
    }
    removeOverlay()
    return try {
      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      val lp = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT
      )
      val view = buildReminderCard(block) { action -> onOverlayAction(block, action) }
      wm.addView(view, lp)
      overlayView = view
      handler.removeCallbacks(dismissOverlay)
      handler.postDelayed(dismissOverlay, OVERLAY_TIMEOUT_MS)
      true
    } catch (e: Exception) {
      overlayView = null
      false
    }
  }

  private fun onOverlayAction(block: TriggerHandler.Block, action: String) {
    when (action) {
      "resisted" -> Prefs.addPending(this, block.pkg, block.appName, block.category, true, "resisted")
      "proceeded" -> {
        Prefs.addPending(this, block.pkg, block.appName, block.category, true, "proceeded")
        // Don't immediately re-show the pop-up while they use the app.
        val graceMs = Prefs.getReminderSeconds(this).toLong() * 1000L
        Prefs.setProceedGrace(this, block.pkg, System.currentTimeMillis() + graceMs)
      }
    }
    removeOverlay()
  }

  private fun removeOverlay() {
    handler.removeCallbacks(dismissOverlay)
    val v = overlayView ?: return
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v)
    } catch (e: Exception) {
      // already detached
    }
    overlayView = null
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  /** Build the reminder card: dim scrim + centered card with title, message and
   *  two buttons. Tapping a button fires [onAction] with "resisted"/"proceeded". */
  private fun buildReminderCard(
    block: TriggerHandler.Block,
    onAction: (String) -> Unit
  ): View {
    val root = FrameLayout(this)
    root.setBackgroundColor(0xCC0A0E1A.toInt())
    root.setPadding(dp(24), dp(24), dp(24), dp(24))
    root.isClickable = true // swallow taps on the scrim

    val card = LinearLayout(this)
    card.orientation = LinearLayout.VERTICAL
    val cardBg = GradientDrawable()
    cardBg.setColor(0xFF141A2E.toInt())
    cardBg.cornerRadius = dp(20).toFloat()
    card.background = cardBg
    card.setPadding(dp(22), dp(22), dp(22), dp(18))
    val cardLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    )
    cardLp.gravity = Gravity.CENTER
    card.layoutParams = cardLp

    val title = TextView(this)
    title.text = "You opened ${block.appName}"
    title.setTextColor(0xFFFFFFFF.toInt())
    title.textSize = 18f
    title.setTypeface(title.typeface, Typeface.BOLD)
    card.addView(title)

    val member = Prefs.getReminderMember(this)
    val message = Prefs.getReminderMessage(this)
    val msg = TextView(this)
    msg.text = if (member.isNotBlank()) "$message\n— $member" else message
    msg.setTextColor(0xFFB7C0D8.toInt())
    msg.textSize = 15f
    val msgLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    )
    msgLp.topMargin = dp(12)
    msg.layoutParams = msgLp
    card.addView(msg)

    val row = LinearLayout(this)
    row.orientation = LinearLayout.HORIZONTAL
    val rowLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    )
    rowLp.topMargin = dp(20)
    row.layoutParams = rowLp

    val proceed = makeButton("Continue anyway", filled = false) { onAction("proceeded") }
    val stop = makeButton("Not now", filled = true) { onAction("resisted") }
    val proceedLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    proceedLp.rightMargin = dp(6)
    val stopLp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    stopLp.leftMargin = dp(6)
    row.addView(proceed, proceedLp)
    row.addView(stop, stopLp)
    card.addView(row)

    root.addView(card)
    return root
  }

  private fun makeButton(label: String, filled: Boolean, onClick: () -> Unit): TextView {
    val b = TextView(this)
    b.text = label
    b.gravity = Gravity.CENTER
    b.textSize = 15f
    b.setPadding(dp(8), dp(13), dp(8), dp(13))
    b.isClickable = true
    val bg = GradientDrawable()
    bg.cornerRadius = dp(12).toFloat()
    if (filled) {
      bg.setColor(0xFF2FE3A8.toInt())
      b.setTextColor(0xFF06121F.toInt())
      b.setTypeface(b.typeface, Typeface.BOLD)
    } else {
      bg.setColor(0x00000000)
      bg.setStroke(dp(1), 0xFF3A4763.toInt())
      b.setTextColor(0xFFB7C0D8.toInt())
    }
    b.background = bg
    b.setOnClickListener { onClick() }
    return b
  }

  /* --------------------------- notification fallback ------------------------ */

  /**
   * Fallback when the overlay can't be drawn (permission not granted): a
   * heads-up reminder notification. Stashes the trigger so tapping it opens
   * BettrMind to the reminder/countdown screen (consumed via consumeLaunchTrigger).
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
