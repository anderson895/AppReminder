package expo.modules.appdetector

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.CountDownTimer
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Builds and drives the BettrMind "friction" reminder card: the reference card
 * (Stage 1) → the pause countdown (Stage 2) → continue.
 *
 * UI-only and host-agnostic — it renders into the [root] it's handed and reports
 * the user's choice through [listener]. The full-screen [ReminderActivity] hosts
 * it. (It used to be drawn as a SYSTEM_ALERT_WINDOW overlay straight from the
 * service, but banking apps such as GCash detect overlays drawn over them and
 * block their own screen; a full-screen Activity simply takes the foreground
 * instead, so there's nothing for them to flag.)
 */
class ReminderCardController(
  private val ctx: Context,
  private val root: FrameLayout,
  private val block: TriggerHandler.Block,
  private val listener: Listener
) {
  interface Listener {
    /** The user chose not to open the watched app. */
    fun onResisted()
    /** The user waited out the pause and chose to continue. */
    fun onProceeded()
  }

  private var countdownTimer: CountDownTimer? = null

  // Pop-up palette (matches referenceUis/popup_reminder.png — teal "friction" card).
  private val cardBgColor = 0xFF173A33.toInt()
  private val photoBgColor = 0xFF2C7A6B.toInt()
  private val accentColor = 0xFF1E9E86.toInt()
  private val accentLight = 0xFFBFEDE0.toInt()
  private val whiteColor = 0xFFFFFFFF.toInt()

  /** Render the reminder. */
  fun show() {
    showReminderStage()
  }

  /** Stop any running countdown — call from the host's onDestroy. */
  fun cancel() {
    countdownTimer?.cancel()
    countdownTimer = null
  }

  private fun dp(value: Int): Int = (value * ctx.resources.displayMetrics.density).toInt()

  /** A styled, vertical card; mounted into the scrim via [mountCard]. */
  private fun newCard(): LinearLayout {
    val card = LinearLayout(ctx)
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

  /** Replace the root's content with [card], centered and scrollable. */
  private fun mountCard(card: LinearLayout) {
    root.removeAllViews()
    val scroll = ScrollView(ctx)
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
  private fun showReminderStage() {
    val card = newCard()

    val header = TextView(ctx)
    header.text = "before you continue…"
    header.setTextColor(whiteColor)
    header.textSize = 16f
    header.setTypeface(header.typeface, Typeface.BOLD)
    card.addView(header)

    card.addView(buildPhotoBox())

    val member = Prefs.getReminderMember(ctx)
    val from = TextView(ctx)
    from.text = if (member.isNotBlank()) "from $member" else "a message for you"
    from.setTextColor(accentLight)
    from.textSize = 13f
    from.layoutParams = fullWidth(16)
    card.addView(from)

    val msg = TextView(ctx)
    msg.text = Prefs.getReminderMessage(ctx)
    msg.setTextColor(whiteColor)
    msg.textSize = 16f
    msg.setTypeface(msg.typeface, Typeface.BOLD)
    msg.layoutParams = fullWidth(6)
    card.addView(msg)

    val stop = makeButton("I don't need to open this", filled = true) {
      listener.onResisted()
    }
    card.addView(stop, fullWidth(20))

    val proceed = makeButton("I have a real reason — continue", filled = false) {
      showCountdownStage()
    }
    card.addView(proceed, fullWidth(10))

    mountCard(card)
  }

  /** Stage 2: the pause countdown. The user can only proceed once it ends. */
  private fun showCountdownStage() {
    countdownTimer?.cancel()

    val card = newCard()

    val header = TextView(ctx)
    header.text = "Take a moment to pause"
    header.setTextColor(whiteColor)
    header.textSize = 18f
    header.setTypeface(header.typeface, Typeface.BOLD)
    header.gravity = Gravity.CENTER
    card.addView(header)

    val seconds = Prefs.getReminderSeconds(ctx)
    val timer = TextView(ctx)
    timer.text = formatTime(seconds.toLong() * 1000L)
    timer.setTextColor(accentLight)
    timer.textSize = 48f
    timer.setTypeface(timer.typeface, Typeface.BOLD)
    timer.gravity = Gravity.CENTER
    timer.layoutParams = fullWidth(14)
    card.addView(timer)

    val sub = TextView(ctx)
    sub.text = "When the timer ends you can continue."
    sub.setTextColor(0xFFB7C7C2.toInt())
    sub.textSize = 14f
    sub.gravity = Gravity.CENTER
    sub.layoutParams = fullWidth(8)
    card.addView(sub)

    val buttons = LinearLayout(ctx)
    buttons.orientation = LinearLayout.VERTICAL
    buttons.layoutParams = fullWidth(20)
    val changedMind = makeButton("I changed my mind", filled = true) {
      listener.onResisted()
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
          listener.onProceeded()
        }
        buttons.addView(cont, fullWidth(0))
        val close = makeButton("Close", filled = false) {
          listener.onResisted()
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
    val box = FrameLayout(ctx)
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

    val photo = Prefs.getRandomPhoto(ctx)
    val loaded = if (photo.isNotBlank()) {
      try {
        val iv = ImageView(ctx)
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
      val ph = LinearLayout(ctx)
      ph.orientation = LinearLayout.VERTICAL
      ph.gravity = Gravity.CENTER
      ph.layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
      val icon = TextView(ctx)
      icon.text = "👥" // 👥 people glyph
      icon.textSize = 40f
      icon.gravity = Gravity.CENTER
      ph.addView(icon)
      val caption = TextView(ctx)
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
    val b = TextView(ctx)
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
}
