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
import android.content.pm.ActivityInfo
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.CountDownTimer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import java.util.Calendar
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
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
  private var overlayRoot: FrameLayout? = null
  private var countdownTimer: CountDownTimer? = null
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
      // Keep the pop-up upright even when the watched app is in landscape — the
      // overlay's screenOrientation forces the screen to portrait while it shows.
      lp.screenOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

      val root = FrameLayout(this)
      root.setBackgroundColor(0xCC0A0E12.toInt())
      root.setPadding(dp(20), dp(24), dp(20), dp(24))
      root.isClickable = true // swallow taps on the scrim

      wm.addView(root, lp)
      overlayView = root
      overlayRoot = root
      showReminderStage(block)
      true
    } catch (e: Exception) {
      overlayView = null
      overlayRoot = null
      false
    }
  }

  private fun onOverlayAction(block: TriggerHandler.Block, action: String) {
    when (action) {
      "resisted" -> {
        // They decided not to open the app — log it and take them off the app.
        Prefs.addPending(this, block.pkg, block.appName, block.category, true, "resisted")
        goHome()
      }
      "proceeded" -> {
        Prefs.addPending(this, block.pkg, block.appName, block.category, true, "proceeded")
        // After they wait out the pause, don't immediately re-show while they use it.
        val graceMs = Prefs.getReminderSeconds(this).toLong() * 1000L
        Prefs.setProceedGrace(this, block.pkg, System.currentTimeMillis() + graceMs)
      }
    }
    removeOverlay()
  }

  /** Leave the watched app by going to the launcher. Called while the overlay is
   *  still visible, so the background activity start is permitted (our visible
   *  overlay window satisfies the Background-Activity-Launch check). */
  private fun goHome() {
    try {
      val home = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_HOME)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(home)
    } catch (e: Exception) {
      // best effort — if it's blocked, the pop-up still closes
    }
  }

  /** "Don't show today" — snooze every reminder until tomorrow's local midnight. */
  private fun onSnooze() {
    val cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, 1)
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    Prefs.setSnoozeUntil(this, cal.timeInMillis)
    removeOverlay()
  }

  private fun removeOverlay() {
    handler.removeCallbacks(dismissOverlay)
    countdownTimer?.cancel()
    countdownTimer = null
    val v = overlayView
    overlayView = null
    overlayRoot = null
    if (v == null) return
    try {
      (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v)
    } catch (e: Exception) {
      // already detached
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  // Pop-up palette (matches referenceUis/popup_reminder.png — teal "friction" card).
  private val cardBgColor = 0xFF173A33.toInt()
  private val photoBgColor = 0xFF2C7A6B.toInt()
  private val accentColor = 0xFF1E9E86.toInt()
  private val accentLight = 0xFFBFEDE0.toInt()
  private val whiteColor = 0xFFFFFFFF.toInt()

  /** A styled, vertical card; mounted into the scrim via [mountCard]. */
  private fun newCard(): LinearLayout {
    val card = LinearLayout(this)
    card.orientation = LinearLayout.VERTICAL
    val cardBg = GradientDrawable()
    cardBg.setColor(cardBgColor)
    cardBg.cornerRadius = dp(22).toFloat()
    card.background = cardBg
    card.setPadding(dp(20), dp(20), dp(20), dp(20))
    card.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    )
    return card
  }

  /** Replace the scrim's content with [card], centered and scrollable. */
  private fun mountCard(card: LinearLayout) {
    val root = overlayRoot ?: return
    root.removeAllViews()
    val scroll = ScrollView(this)
    val scrollLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    )
    scrollLp.gravity = Gravity.CENTER
    scroll.layoutParams = scrollLp
    scroll.addView(card)
    root.addView(scroll)
  }

  private fun fullWidth(topMargin: Int): LinearLayout.LayoutParams {
    val lp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    )
    lp.topMargin = dp(topMargin)
    return lp
  }

  /** Stage 1: the reference reminder card. */
  private fun showReminderStage(block: TriggerHandler.Block) {
    handler.removeCallbacks(dismissOverlay)
    handler.postDelayed(dismissOverlay, OVERLAY_TIMEOUT_MS)

    val card = newCard()

    val header = TextView(this)
    header.text = "before you continue…"
    header.setTextColor(whiteColor)
    header.textSize = 16f
    header.setTypeface(header.typeface, Typeface.BOLD)
    card.addView(header)

    card.addView(buildPhotoBox())

    val member = Prefs.getReminderMember(this)
    val from = TextView(this)
    from.text = if (member.isNotBlank()) "from $member" else "a message for you"
    from.setTextColor(accentLight)
    from.textSize = 13f
    from.layoutParams = fullWidth(16)
    card.addView(from)

    val msg = TextView(this)
    msg.text = Prefs.getReminderMessage(this)
    msg.setTextColor(whiteColor)
    msg.textSize = 16f
    msg.setTypeface(msg.typeface, Typeface.BOLD)
    msg.layoutParams = fullWidth(6)
    card.addView(msg)

    val stop = makeButton("I don't need to open this", filled = true) {
      onOverlayAction(block, "resisted")
    }
    card.addView(stop, fullWidth(20))

    val proceed = makeButton("I have a real reason — continue", filled = false) {
      showCountdownStage(block)
    }
    card.addView(proceed, fullWidth(10))

    val snooze = makeGhostButton("Don't show again today") { onSnooze() }
    card.addView(snooze, fullWidth(4))

    mountCard(card)
  }

  /** Stage 2: the pause countdown. The user can only proceed once it ends. */
  private fun showCountdownStage(block: TriggerHandler.Block) {
    handler.removeCallbacks(dismissOverlay) // never auto-dismiss during the pause
    countdownTimer?.cancel()

    val card = newCard()

    val header = TextView(this)
    header.text = "Take a moment to pause"
    header.setTextColor(whiteColor)
    header.textSize = 18f
    header.setTypeface(header.typeface, Typeface.BOLD)
    header.gravity = Gravity.CENTER
    card.addView(header)

    val seconds = Prefs.getReminderSeconds(this)
    val timer = TextView(this)
    timer.text = formatTime(seconds.toLong() * 1000L)
    timer.setTextColor(accentLight)
    timer.textSize = 48f
    timer.setTypeface(timer.typeface, Typeface.BOLD)
    timer.gravity = Gravity.CENTER
    timer.layoutParams = fullWidth(14)
    card.addView(timer)

    val sub = TextView(this)
    sub.text = "When the timer ends you can continue."
    sub.setTextColor(0xFFB7C7C2.toInt())
    sub.textSize = 14f
    sub.gravity = Gravity.CENTER
    sub.layoutParams = fullWidth(8)
    card.addView(sub)

    val buttons = LinearLayout(this)
    buttons.orientation = LinearLayout.VERTICAL
    buttons.layoutParams = fullWidth(20)
    val changedMind = makeButton("I changed my mind", filled = true) {
      onOverlayAction(block, "resisted")
    }
    buttons.addView(changedMind, fullWidth(0))
    card.addView(buttons)

    mountCard(card)

    countdownTimer = object : CountDownTimer(seconds.toLong() * 1000L, 1000L) {
      override fun onTick(msLeft: Long) {
        timer.text = formatTime(msLeft)
      }

      override fun onFinish() {
        timer.text = "0:00"
        sub.text = "You waited it out. You can continue now."
        buttons.removeAllViews()
        val cont = makeButton("Continue to ${block.appName}", filled = true) {
          onOverlayAction(block, "proceeded")
        }
        buttons.addView(cont, fullWidth(0))
        val close = makeButton("Close", filled = false) {
          onOverlayAction(block, "resisted")
        }
        buttons.addView(close, fullWidth(10))
      }
    }.start()
  }

  private fun formatTime(ms: Long): String {
    val total = (ms / 1000).toInt()
    return String.format("%d:%02d", total / 60, total % 60)
  }

  /** The motivating family photo, or a teal placeholder with a "your family
   *  photo" caption when none is configured. */
  private fun buildPhotoBox(): View {
    val box = FrameLayout(this)
    val boxBg = GradientDrawable()
    boxBg.setColor(photoBgColor)
    boxBg.cornerRadius = dp(16).toFloat()
    box.background = boxBg
    box.clipToOutline = true
    val boxLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      dp(150)
    )
    boxLp.topMargin = dp(14)
    box.layoutParams = boxLp

    val photo = Prefs.getRandomPhoto(this)
    val loaded = if (photo.isNotBlank()) {
      try {
        val iv = ImageView(this)
        iv.scaleType = ImageView.ScaleType.CENTER_CROP
        iv.layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
        iv.setImageURI(Uri.parse(photo))
        if (iv.drawable != null) { box.addView(iv); true } else false
      } catch (e: Exception) {
        false
      }
    } else {
      false
    }

    if (!loaded) {
      val ph = LinearLayout(this)
      ph.orientation = LinearLayout.VERTICAL
      ph.gravity = Gravity.CENTER
      ph.layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
      val icon = TextView(this)
      icon.text = "👥" // 👥 people glyph
      icon.textSize = 40f
      icon.gravity = Gravity.CENTER
      ph.addView(icon)
      val caption = TextView(this)
      caption.text = "your family photo"
      caption.setTextColor(0xFFE0F2EC.toInt())
      caption.textSize = 13f
      val capLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
      capLp.topMargin = dp(4)
      caption.layoutParams = capLp
      ph.addView(caption)
      box.addView(ph)
    }
    return box
  }

  private fun makeButton(label: String, filled: Boolean, onClick: () -> Unit): TextView {
    val b = TextView(this)
    b.text = label
    b.gravity = Gravity.CENTER
    b.textSize = 15f
    b.setPadding(dp(8), dp(15), dp(8), dp(15))
    b.isClickable = true
    val bg = GradientDrawable()
    bg.cornerRadius = dp(14).toFloat()
    if (filled) {
      bg.setColor(accentColor)
      b.setTextColor(whiteColor)
      b.setTypeface(b.typeface, Typeface.BOLD)
    } else {
      bg.setColor(0x00000000)
      bg.setStroke(dp(1), accentColor)
      b.setTextColor(accentLight)
    }
    b.background = bg
    b.setOnClickListener { onClick() }
    return b
  }

  /** A subtle text-only button (e.g. "Don't show again today"). */
  private fun makeGhostButton(label: String, onClick: () -> Unit): TextView {
    val b = TextView(this)
    b.text = label
    b.gravity = Gravity.CENTER
    b.textSize = 13f
    b.setPadding(dp(8), dp(12), dp(8), dp(8))
    b.isClickable = true
    b.setTextColor(0xFF8AA39C.toInt())
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
