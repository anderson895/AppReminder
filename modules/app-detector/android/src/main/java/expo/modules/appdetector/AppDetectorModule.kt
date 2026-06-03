package expo.modules.appdetector

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

class AppDetectorModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("AppDetector")

    Function("hasUsageAccess") { hasUsageAccess() }

    Function("openUsageAccessSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("hasOverlayPermission") { Settings.canDrawOverlays(context) }

    Function("isAccessibilityEnabled") { isAccessibilityEnabled() }

    Function("openAccessibilitySettings") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("openOverlaySettings") {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:" + context.packageName)
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("startMonitoring") { appsJson: String ->
      Prefs.setTriggers(context, appsJson)
      val intent = Intent(context, AppMonitorService::class.java)
      intent.putExtra("apps", appsJson)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    Function("configureReminder") { member: String, message: String, seconds: Int, photosJson: String ->
      Prefs.setReminderConfig(context, member, message, seconds, photosJson)
    }

    Function("stopMonitoring") {
      context.stopService(Intent(context, AppMonitorService::class.java))
      Prefs.setMonitoring(context, false)
    }

    Function("isMonitoring") { Prefs.isMonitoring(context) }

    Function("getPendingOpensJson") { Prefs.getPending(context) }

    Function("clearPendingOpens") { Prefs.clearPending(context) }

    Function("consumeLaunchTriggerJson") {
      val trigger = Prefs.getLaunchTrigger(context)
      Prefs.clearLaunchTrigger(context)
      trigger
    }

    // Apps the user muted via "don't show again", as JSON [{packageName, appName}].
    Function("getMutedAppsJson") { Prefs.getMutedJson(context) }

    // Un-mute an app so its reminder pop-up shows again.
    Function("unmuteApp") { pkg: String -> Prefs.removeMuted(context, pkg) }

    // Launchable apps installed on the device, as JSON [{packageName, label}].
    Function("getInstalledAppsJson") {
      val pm = context.packageManager
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val activities = pm.queryIntentActivities(intent, 0)
      val seen = HashSet<String>()
      val arr = JSONArray()
      for (ri in activities) {
        val pkg = ri.activityInfo.packageName
        if (pkg == context.packageName) continue
        if (!seen.add(pkg)) continue
        val label = try {
          ri.loadLabel(pm).toString()
        } catch (e: Exception) {
          pkg
        }
        val o = JSONObject()
        o.put("packageName", pkg)
        o.put("label", label)
        arr.put(o)
      }
      arr.toString()
    }
  }

  private fun isAccessibilityEnabled(): Boolean {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabled.contains(AppBlockerAccessibilityService::class.java.name)
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
