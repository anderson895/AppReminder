package expo.modules.appdetector

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Shared logic that turns a "this package came to the foreground" signal into a
 * decision: log the open, and — for an un-muted trigger app that isn't within
 * its post-continue grace — tell the caller to show the reminder.
 *
 * Used by the UsageStats poller ([AppMonitorService]). Its dedupe state is a
 * process-global object singleton so the same open never double-fires.
 */
object TriggerHandler {
  private const val DEBOUNCE_MS = 1500L

  @Volatile private var lastPkg: String? = null
  @Volatile private var lastAt = 0L

  data class Block(val pkg: String, val appName: String, val category: String)

  /**
   * Evaluate a foreground package. Returns a [Block] when the caller should show
   * the reminder, or null (non-trigger, muted, within grace, ignored, or a
   * debounced duplicate). Logs the open as a side effect.
   */
  @Synchronized
  fun evaluate(ctx: Context, pkg: String): Block? {
    val lower = pkg.lowercase()

    if (pkg == ctx.packageName) {
      // The user is inside BettrMind itself (e.g. un-muting in Settings, or the
      // blocker is up). Forget the last package so the next trigger-app open is
      // always re-evaluated.
      lastPkg = null
      return null
    }
    if (lower.contains("launcher") ||
      pkg == "com.android.systemui" ||
      lower.contains("inputmethod")
    ) {
      return null
    }

    val now = System.currentTimeMillis()
    if (pkg == lastPkg && now - lastAt < DEBOUNCE_MS) return null
    lastPkg = pkg
    lastAt = now

    var match: JSONObject? = null
    val triggers = try {
      JSONArray(Prefs.getTriggers(ctx))
    } catch (e: Exception) {
      JSONArray()
    }
    for (i in 0 until triggers.length()) {
      val t = triggers.optJSONObject(i) ?: continue
      val tp = t.optString("packageName")
      if (tp.isNotEmpty() && tp == pkg) {
        match = t
        break
      }
    }

    val appName = match?.optString("appName")?.takeIf { it.isNotEmpty() }
      ?: getAppLabel(ctx, pkg) ?: pkg
    val category = match?.optString("category")?.takeIf { it.isNotEmpty() } ?: "other"
    val isTrigger = match != null

    if (!isTrigger) {
      Prefs.addPending(ctx, pkg, appName, category, false, "opened")
      return null
    }
    if (Prefs.isMuted(ctx, pkg)) {
      Prefs.addPending(ctx, pkg, appName, category, true, "opened")
      return null
    }
    if (Prefs.isWithinGrace(ctx, pkg)) {
      // User recently waited out the countdown and chose to continue — let them.
      Prefs.addPending(ctx, pkg, appName, category, true, "opened")
      return null
    }

    // Log the open now so it always shows in the feed. The outcome
    // (resisted/proceeded) is logged later from the in-app reminder screen.
    Prefs.addPending(ctx, pkg, appName, category, true, "opened")
    return Block(pkg, appName, category)
  }

  private fun getAppLabel(ctx: Context, pkg: String): String? = try {
    val pm = ctx.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
  } catch (e: Exception) {
    null
  }
}
