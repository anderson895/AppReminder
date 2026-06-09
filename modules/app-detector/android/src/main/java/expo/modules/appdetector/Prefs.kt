package expo.modules.appdetector

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lightweight persistence for the monitor. Survives the JS engine being killed,
 * so detected app-opens are buffered until the BetFree app next reads them.
 */
object Prefs {
  private const val NAME = "bettrmind_app_detector"
  private const val MAX_PENDING = 300

  // MODE_MULTI_PROCESS forces a reload from disk on each open, so writes made in
  // one component (e.g. the React UI un-muting an app) are seen by another (the
  // monitor service deciding whether to show the reminder), and vice-versa.
  // Without it, a process's cached SharedPreferences can miss the other's edits.
  @Suppress("DEPRECATION")
  private fun p(ctx: Context) =
    ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE or Context.MODE_MULTI_PROCESS)

  fun setTriggers(ctx: Context, json: String) {
    p(ctx).edit().putString("triggers", json).apply()
  }

  fun getTriggers(ctx: Context): String = p(ctx).getString("triggers", "[]") ?: "[]"

  fun setMonitoring(ctx: Context, value: Boolean) {
    p(ctx).edit().putBoolean("monitoring", value).apply()
  }

  fun isMonitoring(ctx: Context): Boolean = p(ctx).getBoolean("monitoring", false)

  fun getPending(ctx: Context): String = p(ctx).getString("pending", "[]") ?: "[]"

  fun clearPending(ctx: Context) {
    p(ctx).edit().putString("pending", "[]").apply()
  }

  @Synchronized
  fun addPending(
    ctx: Context,
    pkg: String,
    appName: String,
    category: String,
    isTrigger: Boolean,
    action: String
  ) {
    val arr = try {
      JSONArray(getPending(ctx))
    } catch (e: Exception) {
      JSONArray()
    }
    val o = JSONObject()
    o.put("packageName", pkg)
    o.put("appName", appName)
    o.put("category", category)
    o.put("isTrigger", isTrigger)
    o.put("action", action) // 'opened' | 'resisted' | 'proceeded'
    o.put("at", System.currentTimeMillis())
    arr.put(o)

    val out = if (arr.length() > MAX_PENDING) {
      val trimmed = JSONArray()
      for (i in arr.length() - MAX_PENDING until arr.length()) trimmed.put(arr.get(i))
      trimmed
    } else {
      arr
    }
    p(ctx).edit().putString("pending", out.toString()).apply()
  }

  fun setLaunchTrigger(ctx: Context, pkg: String, appName: String, category: String) {
    val o = JSONObject()
    o.put("packageName", pkg)
    o.put("appName", appName)
    o.put("category", category)
    o.put("at", System.currentTimeMillis())
    p(ctx).edit().putString("launchTrigger", o.toString()).apply()
  }

  fun getLaunchTrigger(ctx: Context): String = p(ctx).getString("launchTrigger", "") ?: ""

  fun clearLaunchTrigger(ctx: Context) {
    p(ctx).edit().remove("launchTrigger").apply()
  }

  /* ---- reminder configuration (from the user's settings) ---- */

  fun setReminderConfig(
    ctx: Context,
    member: String,
    message: String,
    seconds: Int,
    photosJson: String
  ) {
    p(ctx).edit()
      .putString("reminderMember", member)
      .putString("reminderMessage", message)
      .putInt("reminderSeconds", seconds)
      .putString("reminderPhotos", photosJson)
      .apply()
  }

  fun getReminderMember(ctx: Context): String =
    p(ctx).getString("reminderMember", "mama") ?: "mama"

  fun getReminderMessage(ctx: Context): String =
    p(ctx).getString("reminderMessage", "We believe in you. Choose us over gambling.")
      ?: "We believe in you. Choose us over gambling."

  fun getReminderSeconds(ctx: Context): Int = p(ctx).getInt("reminderSeconds", 900)

  /** A random motivation photo uri from the configured list, or "" if none. */
  fun getRandomPhoto(ctx: Context): String {
    val json = p(ctx).getString("reminderPhotos", "[]") ?: "[]"
    return try {
      val arr = JSONArray(json)
      if (arr.length() == 0) "" else arr.getString((Math.random() * arr.length()).toInt())
    } catch (e: Exception) {
      ""
    }
  }

  /* ---- temporary "you may proceed" grace ----
   * After the user waits out the countdown and chooses to continue, we can let
   * them use that app for a while without re-reminding. Stored as { packageName:
   * untilEpochMillis }. */

  private fun graceMap(ctx: Context): JSONObject = try {
    JSONObject(p(ctx).getString("graceMap", "{}") ?: "{}")
  } catch (e: Exception) {
    JSONObject()
  }

  fun setProceedGrace(ctx: Context, pkg: String, untilMillis: Long) {
    val map = graceMap(ctx)
    map.put(pkg, untilMillis)
    p(ctx).edit().putString("graceMap", map.toString()).apply()
  }

  fun isWithinGrace(ctx: Context, pkg: String): Boolean =
    graceMap(ctx).optLong(pkg, 0L) > System.currentTimeMillis()
}
