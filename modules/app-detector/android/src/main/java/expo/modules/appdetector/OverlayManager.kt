package expo.modules.appdetector

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Draws the reminder + countdown as a real system overlay on top of whatever
 * app is in the foreground (requires "Display over other apps").
 */
class OverlayManager(private val ctx: Context) {
  private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val handler = Handler(Looper.getMainLooper())
  private var root: View? = null
  private var timer: CountDownTimer? = null
  private var showing = false

  // Theme colors (match the BettrMind app)
  private val cBg = Color.parseColor("#2C2C2E")
  private val cTeal = Color.parseColor("#2FE3A8")
  private val cTealDark = Color.parseColor("#1F6E5C")
  private val cText = Color.parseColor("#FFFFFF")
  private val cMuted = Color.parseColor("#9AA0A6")
  private val cOnTeal = Color.parseColor("#0C2A23")
  private val cOutline = Color.parseColor("#54555A")

  private fun dp(v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()
  private fun sp(v: Float): Float = v

  private fun formatTime(totalSec: Int): String {
    val m = totalSec / 60
    val s = totalSec % 60
    return String.format("%d:%02d", m, s)
  }

  fun isShowing(): Boolean = showing

  fun show(
    appName: String,
    packageName: String,
    member: String,
    message: String,
    seconds: Int,
    onOutcome: (String) -> Unit // 'resisted' | 'proceeded'
  ) {
    if (showing) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
      return // no permission; caller falls back
    }
    handler.post { buildAndShow(appName, packageName, member, message, seconds, onOutcome) }
  }

  private fun buildAndShow(
    appName: String,
    packageName: String,
    member: String,
    message: String,
    seconds: Int,
    onOutcome: (String) -> Unit
  ) {
    val scrim = FrameLayout(ctx)
    scrim.setBackgroundColor(Color.parseColor("#E6000000"))

    val card = LinearLayout(ctx)
    card.orientation = LinearLayout.VERTICAL
    card.background = rounded(cBg, dp(22))
    card.setPadding(dp(22), dp(24), dp(22), dp(24))
    val cardLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    )
    cardLp.gravity = Gravity.CENTER
    cardLp.leftMargin = dp(20); cardLp.rightMargin = dp(20)
    scrim.addView(card, cardLp)

    val heading = textView("before you continue…", 22f, cText, true)
    card.addView(heading)

    val ctxLine = TextView(ctx)
    ctxLine.text = "you're opening $appName"
    ctxLine.setTextColor(cMuted)
    ctxLine.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    ctxLine.setPadding(0, dp(4), 0, dp(16))
    card.addView(ctxLine)

    // Random motivation photo (if the user added any)
    val photoBmp = loadBitmap(Prefs.getRandomPhoto(ctx))
    if (photoBmp != null) {
      val img = ImageView(ctx)
      img.setImageBitmap(photoBmp)
      img.scaleType = ImageView.ScaleType.CENTER_CROP
      img.clipToOutline = true
      img.background = rounded(cTealDark, dp(16))
      val imgLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(150)
      )
      imgLp.bottomMargin = dp(12)
      card.addView(img, imgLp)
    }

    // Message box
    val msgBox = LinearLayout(ctx)
    msgBox.orientation = LinearLayout.VERTICAL
    msgBox.background = rounded(cTealDark, dp(16))
    msgBox.setPadding(dp(18), dp(16), dp(18), dp(16))
    card.addView(msgBox, lp(matchW = true, topMargin = 0))
    msgBox.addView(textView("from $member", 13f, cTeal, true))
    val msgT = textView("“$message”", 17f, cText, true)
    msgT.setPadding(0, dp(6), 0, 0)
    msgBox.addView(msgT)

    // Dynamic area (buttons OR countdown)
    val dynamic = LinearLayout(ctx)
    dynamic.orientation = LinearLayout.VERTICAL
    card.addView(dynamic, lp(matchW = true, topMargin = dp(20)))

    fun cleanup() {
      timer?.cancel(); timer = null
      try { root?.let { wm.removeView(it) } } catch (e: Exception) {}
      root = null
      showing = false
    }

    fun goHome() {
      try {
        val home = Intent(Intent.ACTION_MAIN)
        home.addCategory(Intent.CATEGORY_HOME)
        home.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        ctx.startActivity(home)
      } catch (e: Exception) {}
    }

    // Bring the trigger app back to the foreground so it actually continues.
    fun reopenApp() {
      try {
        val launch = ctx.packageManager.getLaunchIntentForPackage(packageName)
        if (launch != null) {
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(launch)
        }
      } catch (e: Exception) {}
    }

    lateinit var showCountdown: () -> Unit

    fun showButtons() {
      dynamic.removeAllViews()
      val resist = pillButton("I don't need to open this", filled = true)
      resist.setOnClickListener {
        onOutcome("resisted")
        cleanup()
        goHome()
      }
      dynamic.addView(resist, lp(matchW = true, topMargin = 0))

      val cont = pillButton("I have a real reason — continue", filled = false)
      cont.setOnClickListener { showCountdown() }
      dynamic.addView(cont, lp(matchW = true, topMargin = dp(12)))

      // "Don't show again" — mute reminders for this app.
      val mute = textView("don't show again", 13f, cMuted, false)
      mute.gravity = Gravity.CENTER
      mute.setPadding(0, dp(14), 0, dp(2))
      mute.setOnClickListener {
        onOutcome("muted")
        cleanup()
        reopenApp()
      }
      dynamic.addView(mute, lp(matchW = true, topMargin = dp(6)))
    }

    showCountdown = {
      dynamic.removeAllViews()
      val take = textView("take a breath", 18f, cText, true)
      take.gravity = Gravity.CENTER
      dynamic.addView(take, lp(matchW = true, topMargin = 0))

      val num = TextView(ctx)
      num.text = formatTime(seconds)
      num.setTextColor(cTeal)
      num.setTextSize(TypedValue.COMPLEX_UNIT_SP, 52f)
      num.gravity = Gravity.CENTER
      num.setPadding(0, dp(10), 0, dp(4))
      dynamic.addView(num, lp(matchW = true, topMargin = 0))

      val unit = textView("remaining", 13f, cMuted, false)
      unit.gravity = Gravity.CENTER
      dynamic.addView(unit, lp(matchW = true, topMargin = 0))

      val changed = pillButton("actually, I changed my mind", filled = false)
      changed.setOnClickListener {
        onOutcome("resisted")
        cleanup()
        goHome()
      }
      dynamic.addView(changed, lp(matchW = true, topMargin = dp(20)))

      timer = object : CountDownTimer((seconds * 1000).toLong(), 1000) {
        override fun onTick(ms: Long) {
          num.text = formatTime(((ms + 999) / 1000).toInt())
        }
        override fun onFinish() {
          onOutcome("proceeded")
          cleanup()
          reopenApp() // bring the trigger app back to the foreground
        }
      }.start()
    }

    showButtons()

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      android.graphics.PixelFormat.TRANSLUCENT
    )

    try {
      wm.addView(scrim, params)
      root = scrim
      showing = true
    } catch (e: Exception) {
      showing = false
    }
  }

  /* ---------- view helpers ---------- */

  private fun textView(t: String, size: Float, color: Int, bold: Boolean): TextView {
    val tv = TextView(ctx)
    tv.text = t
    tv.setTextColor(color)
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    if (bold) tv.setTypeface(tv.typeface, android.graphics.Typeface.BOLD)
    return tv
  }

  private fun pillButton(label: String, filled: Boolean): Button {
    val b = Button(ctx)
    b.text = label
    b.isAllCaps = false
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    b.setPadding(dp(16), dp(14), dp(16), dp(14))
    if (filled) {
      b.background = rounded(cTeal, dp(16))
      b.setTextColor(cOnTeal)
    } else {
      val g = GradientDrawable()
      g.cornerRadius = dp(16).toFloat()
      g.setColor(Color.TRANSPARENT)
      g.setStroke(dp(2), cOutline)
      b.background = g
      b.setTextColor(cText)
    }
    b.setTypeface(b.typeface, android.graphics.Typeface.BOLD)
    b.stateListAnimator = null
    return b
  }

  private fun rounded(color: Int, radius: Int): GradientDrawable {
    val g = GradientDrawable()
    g.cornerRadius = radius.toFloat()
    g.setColor(color)
    return g
  }

  /** Decode a (downsampled) bitmap from a file:// or content:// uri, or null. */
  private fun loadBitmap(uri: String): Bitmap? {
    if (uri.isBlank()) return null
    return try {
      val openStream: () -> java.io.InputStream? = {
        if (uri.startsWith("content://")) {
          ctx.contentResolver.openInputStream(Uri.parse(uri))
        } else {
          val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
          if (path != null) java.io.FileInputStream(path) else null
        }
      }
      // First pass: read bounds to compute a sample size.
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      openStream()?.use { BitmapFactory.decodeStream(it, null, bounds) }
      var sample = 1
      val maxDim = 1080
      while (bounds.outWidth / sample > maxDim || bounds.outHeight / sample > maxDim) {
        sample *= 2
      }
      val opts = BitmapFactory.Options().apply { inSampleSize = sample }
      openStream()?.use { BitmapFactory.decodeStream(it, null, opts) }
    } catch (e: Exception) {
      null
    }
  }

  private fun lp(matchW: Boolean, topMargin: Int): LinearLayout.LayoutParams {
    val w = if (matchW) LinearLayout.LayoutParams.MATCH_PARENT
    else LinearLayout.LayoutParams.WRAP_CONTENT
    val p = LinearLayout.LayoutParams(w, LinearLayout.LayoutParams.WRAP_CONTENT)
    p.topMargin = topMargin
    return p
  }
}
