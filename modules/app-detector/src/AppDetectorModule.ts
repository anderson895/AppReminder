import { requireNativeModule } from 'expo';
import type { AppDetectorNativeModule } from './AppDetector.types';

/**
 * The native module is only present in a real dev/standalone build.
 * In Expo Go (or web) it is absent, so we fall back to null and the
 * JS wrapper degrades gracefully.
 */
let nativeModule: AppDetectorNativeModule | null = null;
try {
  nativeModule = requireNativeModule<AppDetectorNativeModule>('AppDetector');
} catch {
  nativeModule = null;
}

export default nativeModule;
