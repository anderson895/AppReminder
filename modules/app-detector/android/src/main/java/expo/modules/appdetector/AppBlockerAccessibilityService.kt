package expo.modules.appdetector

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

/**
 * Detects foreground-app changes via accessibility events and shows the blocker
 * — the robust path for apps that defeat the overlay-based approach.
 *
 * Security-hardened apps (GCash, Maya, banks) call setHideOverlayWindows(true),
 * which hides BettrMind's BAL-priming overlay, so [AppMonitorService]'s direct
 * Activity launch gets Background-Activity-Launch–blocked. From an accessibility
 * service we can issue GLOBAL_ACTION_HOME (always permitted) to pull the user
 * out of the trigger app; that also un-hides our priming overlay, so the
 * following startActivity for the unhideable full-screen [BlockerActivity] is
 * permitted. Detection here is also instant and more reliable than UsageStats
 * polling. Trigger matching / mute / grace / logging is shared via
 * [TriggerHandler], whose dedupe is process-global so this and the poller don't
 * double-fire.
 */
class AppBlockerAccessibilityService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    val block = TriggerHandler.evaluate(this, pkg) ?: return

    // Pull the user out of the trigger app (also un-hides our priming overlay),
    // then show the full-screen blocker once the transition has settled.
    performGlobalAction(GLOBAL_ACTION_HOME)
    handler.postDelayed({ launchBlocker(block) }, 300)
  }

  private fun launchBlocker(block: TriggerHandler.Block) {
    try {
      val intent = Intent(this, BlockerActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra("packageName", block.pkg)
        .putExtra("appName", block.appName)
        .putExtra("category", block.category)
      startActivity(intent)
    } catch (e: Exception) {
      // As a last resort, the user has already been sent Home (out of the app).
      Prefs.setLaunchTrigger(this, block.pkg, block.appName, block.category)
    }
  }

  override fun onInterrupt() {}
}
