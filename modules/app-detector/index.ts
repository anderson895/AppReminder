import nativeModule from './src/AppDetectorModule';

export type { AppDetectorNativeModule } from './src/AppDetector.types';

/** True only in a real dev/standalone build where the native module exists. */
export const isAvailable = nativeModule != null;

export function hasUsageAccess(): boolean {
  return nativeModule?.hasUsageAccess() ?? false;
}

export function openUsageAccessSettings(): void {
  nativeModule?.openUsageAccessSettings();
}

export function hasOverlayPermission(): boolean {
  return nativeModule?.hasOverlayPermission() ?? false;
}

export function openOverlaySettings(): void {
  nativeModule?.openOverlaySettings();
}

export function isAccessibilityEnabled(): boolean {
  return nativeModule?.isAccessibilityEnabled() ?? false;
}

export function openAccessibilitySettings(): void {
  nativeModule?.openAccessibilitySettings();
}

export function startMonitoring(appsJson: string): void {
  nativeModule?.startMonitoring(appsJson);
}

export function configureReminder(
  member: string,
  message: string,
  seconds: number,
  photosJson: string
): void {
  nativeModule?.configureReminder(member, message, seconds, photosJson);
}

export function stopMonitoring(): void {
  nativeModule?.stopMonitoring();
}

export function isMonitoring(): boolean {
  return nativeModule?.isMonitoring() ?? false;
}

export function getPendingOpensJson(): string {
  return nativeModule?.getPendingOpensJson() ?? '[]';
}

export function clearPendingOpens(): void {
  nativeModule?.clearPendingOpens();
}

export function consumeLaunchTriggerJson(): string {
  return nativeModule?.consumeLaunchTriggerJson() ?? '';
}

export function getInstalledAppsJson(): string {
  return nativeModule?.getInstalledAppsJson() ?? '[]';
}

export function getMutedAppsJson(): string {
  return nativeModule?.getMutedAppsJson() ?? '[]';
}

export function unmuteApp(packageName: string): void {
  nativeModule?.unmuteApp(packageName);
}
