export interface AppDetectorNativeModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  hasOverlayPermission(): boolean;
  openOverlaySettings(): void;
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  startMonitoring(appsJson: string): void;
  configureReminder(
    member: string,
    message: string,
    seconds: number,
    photosJson: string
  ): void;
  stopMonitoring(): void;
  isMonitoring(): boolean;
  getPendingOpensJson(): string;
  clearPendingOpens(): void;
  consumeLaunchTriggerJson(): string;
  getInstalledAppsJson(): string;
  getMutedAppsJson(): string;
  unmuteApp(packageName: string): void;
}
