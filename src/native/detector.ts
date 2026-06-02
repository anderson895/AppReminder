import * as Native from '../../modules/app-detector';
import type { DetectedOpen, TriggerApp, Category, EventAction } from '../types';

/** Whether real native detection is available (false in Expo Go / web). */
export const detectionAvailable = Native.isAvailable;

export function hasUsageAccess(): boolean {
  return Native.hasUsageAccess();
}

export function openUsageAccessSettings(): void {
  Native.openUsageAccessSettings();
}

export function hasOverlayPermission(): boolean {
  return Native.hasOverlayPermission();
}

export function openOverlaySettings(): void {
  Native.openOverlaySettings();
}

export function isMonitoring(): boolean {
  return Native.isMonitoring();
}

export function stopMonitoring(): void {
  Native.stopMonitoring();
}

/** Start the foreground monitor with the apps that have a package name set. */
export function startMonitoring(apps: TriggerApp[]): void {
  const list = apps
    .filter((a) => a.package_name.trim().length > 0)
    .map((a) => ({
      packageName: a.package_name,
      appName: a.app_name,
      category: a.category,
    }));
  Native.startMonitoring(JSON.stringify(list));
}

/**
 * Tell the native overlay what message + countdown + motivation photos to show.
 * The native side picks one photo at random each time the reminder appears.
 */
export function configureReminder(
  member: string,
  message: string,
  seconds: number,
  photos: string[] = []
): void {
  Native.configureReminder(member, message, seconds, JSON.stringify(photos));
}

/** Read the buffer of app-opens the service recorded while we weren't looking. */
export function getPendingOpens(): DetectedOpen[] {
  try {
    const parsed = JSON.parse(Native.getPendingOpensJson()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o): o is DetectedOpen => !!o && typeof o.packageName === 'string')
      .map((o) => ({
        packageName: o.packageName,
        appName: o.appName,
        category: (o.category as Category) ?? 'other',
        isTrigger: !!o.isTrigger,
        action: (o.action as EventAction) ?? 'opened',
        at: typeof o.at === 'number' ? o.at : 0,
      }));
  } catch {
    return [];
  }
}

export function clearPendingOpens(): void {
  Native.clearPendingOpens();
}

export interface InstalledApp {
  packageName: string;
  label: string;
}

/** All launchable apps installed on the device (for the admin picker). */
export function getInstalledApps(): InstalledApp[] {
  try {
    const parsed = JSON.parse(Native.getInstalledAppsJson()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a): a is InstalledApp => !!a && typeof a.packageName === 'string')
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

export interface MutedApp {
  packageName: string;
  appName: string;
}

/** Apps the user silenced via "don't show again" on the pop-up. */
export function getMutedApps(): MutedApp[] {
  try {
    const parsed = JSON.parse(Native.getMutedAppsJson()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a): a is MutedApp => !!a && typeof a.packageName === 'string')
      .map((a) => ({ packageName: a.packageName, appName: a.appName || a.packageName }))
      .sort((a, b) => a.appName.localeCompare(b.appName));
  } catch {
    return [];
  }
}

/** Un-mute an app so its reminder pop-up shows again. */
export function unmuteApp(packageName: string): void {
  Native.unmuteApp(packageName);
}

/** If a trigger app was just opened, returns it once (then clears it). */
export function consumeLaunchTrigger(): DetectedOpen | null {
  const raw = Native.consumeLaunchTriggerJson();
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as DetectedOpen;
    return { ...o, category: (o.category as Category) ?? 'other', isTrigger: true };
  } catch {
    return null;
  }
}
