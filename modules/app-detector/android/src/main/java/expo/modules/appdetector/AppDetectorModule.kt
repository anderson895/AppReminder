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
