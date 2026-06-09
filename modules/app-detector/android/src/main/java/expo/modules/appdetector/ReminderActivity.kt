package expo.modules.appdetector

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.FrameLayout

/**
 * Full-screen "friction" reminder shown when the user opens a watched app.
 *
 * This replaces the old SYSTEM_ALERT_WINDOW overlay. An overlay is drawn *on top
 * of* the watched app while that app is still in the foreground — which banking
 * apps (e.g. GCash) detect as a tap-jacking risk and respond to by blocking
 * their own screen. An Activity instead simply *takes* the foreground: the
 * watched app is paused into the background (exactly as if the user pressed Home
 * or got a call), so there's no overlay for it to flag.
 *
 * Launched from [AppMonitorService]. The background-activity-launch is permitted
 * because the app holds SYSTEM_ALERT_WINDOW (the service verifies it first).
 * Orientation is locked to portrait and kept out of Recents via the manifest.
 */
class ReminderActivity : Activity(), ReminderCardController.Listener {
  private var controller: ReminderCardController? = null
  private lateinit var root: FrameLayout
  private lateinit var block: TriggerHandler.Block

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Show over the lock screen / keyguard so the reminder still appears.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }

    root = FrameLayout(this)
    root.setBackgroundColor(0xF20A0E12.toInt()) // near-opaque dark scrim
    root.setPadding(dp(20), dp(24), dp(20), dp(24))
    root.fitsSystemWindows = true
    setContentView(
      root,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    )

    if (!bind(intent)) {
      finish()
      return
    }
    showCard()
  }

  /**
   * A fresh trigger arrived while we're already up (singleTask) — rebuild for the
   * new app rather than showing a stale card.
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (!bind(intent)) return
    showCard()
  }

  /** Read the watched-app details from [intent]; false if the intent is unusable. */
  private fun bind(intent: Intent): Boolean {
    val pkg = intent.getStringExtra(EXTRA_PKG)
    if (pkg.isNullOrEmpty()) return false
    val appName = intent.getStringExtra(EXTRA_APP_NAME)?.takeIf { it.isNotEmpty() } ?: pkg
    val category = intent.getStringExtra(EXTRA_CATEGORY)?.takeIf { it.isNotEmpty() } ?: "other"
    block = TriggerHandler.Block(pkg, appName, category)
    return true
  }

  private fun showCard() {
    controller?.cancel()
    controller = ReminderCardController(this, root, block, this).also { it.show() }
  }

  override fun onResisted() {
    Prefs.addPending(this, block.pkg, block.appName, block.category, true, "resisted")
    goHome()
    finish()
  }

  override fun onProceeded() {
    Prefs.addPending(this, block.pkg, block.appName, block.category, true, "proceeded")
    // After they wait out the pause, don't immediately re-show while they use it.
    val graceMs = Prefs.getReminderSeconds(this).toLong() * 1000L
    Prefs.setProceedGrace(this, block.pkg, System.currentTimeMillis() + graceMs)
    // Returning to the previous task drops them back into the watched app.
    finish()
  }

  /** Back press = "I changed my mind" — never silently fall back into the app. */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    onResisted()
  }

  override fun onDestroy() {
    controller?.cancel()
    controller = null
    super.onDestroy()
  }

  /** Leave the watched app by going to the launcher. */
  private fun goHome() {
    try {
      startActivity(
        Intent(Intent.ACTION_MAIN)
          .addCategory(Intent.CATEGORY_HOME)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    } catch (e: Exception) {
      // best effort — finishing still closes the reminder
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_PKG = "pkg"
    const val EXTRA_APP_NAME = "appName"
    const val EXTRA_CATEGORY = "category"
  }
}
