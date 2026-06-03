package expo.modules.appdetector

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.Window
import android.view.WindowManager

/**
 * Full-screen reminder shown on top of a trigger app. Unlike a system overlay,
 * this is a real foreground Activity, so security-hardened apps (GCash, Maya,
 * banks) cannot hide it with setHideOverlayWindows(). It is launched by
 * [AppMonitorService] (permitted to start from the background because the app
 * holds the SYSTEM_ALERT_WINDOW permission). Locked to portrait via the
 * manifest and refuses the back button until the user resolves it.
 */
class BlockerActivity : Activity() {
  private var resolved = false
  private var pkg = ""
  private var appName = "this app"
  private var category = "other"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    window.setBackgroundDrawable(ColorDrawable(Color.BLACK))
    // Draw edge-to-edge under the system bars.
    window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
    }

    pkg = intent.getStringExtra("packageName") ?: ""
    appName = intent.getStringExtra("appName") ?: "this app"
    category = intent.getStringExtra("category") ?: "other"

    val member = Prefs.getReminderMember(this)
    val message = Prefs.getReminderMessage(this)
    val seconds = Prefs.getReminderSeconds(this)

    val view: View = ReminderView(this, appName, member, message, seconds) { action ->
      handleAction(action)
    }.build()
    setContentView(view)
  }

  /** A fresh trigger arrived while we were already up — refresh the contents. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  private fun handleAction(action: String) {
    if (resolved) return
    resolved = true
    when (action) {
      "resisted" -> {
        Prefs.addPending(this, pkg, appName, category, true, "resisted")
        goHome()
      }
      "proceeded" -> {
        Prefs.addPending(this, pkg, appName, category, true, "proceeded")
        reopenApp()
      }
      "muted" -> {
        // The open was already logged by AppMonitorService before this activity
        // launched, so we don't log it again here — just mute and continue.
        Prefs.addMuted(this, pkg, appName)
        reopenApp()
      }
    }
    finish()
    overridePendingTransition(0, 0)
  }

  /** Send the user to the launcher (they chose not to open the app). */
  private fun goHome() {
    try {
      val home = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_HOME)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(home)
    } catch (e: Exception) {}
  }

  /** Bring the trigger app back to the foreground so it actually continues. */
  private fun reopenApp() {
    try {
      val launch = packageManager.getLaunchIntentForPackage(pkg)
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launch)
      }
    } catch (e: Exception) {}
  }

  // Block the back button — the reminder must be resolved with a choice.
  @Suppress("DEPRECATION", "MissingSuperCall")
  override fun onBackPressed() {
    // intentionally swallowed
  }
}
