export interface AppDetectorNativeModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  hasOverlayPermission(): boolean;
  openOverlaySettings(): void;
  startMonitoring(appsJson: string): void;
  stopMonitoring(): void;
  isMonitoring(): boolean;
  getPendingOpensJson(): string;
  clearPendingOpens(): void;
  consumeLaunchTriggerJson(): string;
}
