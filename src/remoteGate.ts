import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remote app gate (developer kill-switch).
 *
 * The app reads a single Firestore document `config/app` over the REST API:
 *   { enabled: <bool>, message: <string> }
 * If `enabled` is false, the whole app shows a lock screen. The flag is flipped
 * from the Firebase console only (read-only to clients via security rules).
 *
 * Offline behaviour: the last fetched status is cached. A device that has never
 * reached Firebase defaults to ENABLED (so first-run offline still works); once
 * it has seen `disabled`, that stays cached and the app remains locked offline.
 */
const PROJECT_ID = 'bettrmind-ba10a';
const API_KEY = 'AIzaSyD7tybMNUeWDrNym1cPdg5Lty4TB1Ilz8w';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/app?key=${API_KEY}`;
const CACHE_KEY = 'bettrmind.gate';
const DEFAULT_MESSAGE =
  'This application has been disabled. Please contact the developer to restore access.';

export interface GateState {
  ready: boolean; // initial decision made (from cache) — safe to render
  locked: boolean;
  message: string;
}

interface RemoteStatus {
  enabled: boolean;
  message: string;
}

/** Fetch the remote flag. Returns null on any failure (network/404/parse). */
async function fetchStatus(): Promise<RemoteStatus | null> {
  try {
    const res = await fetch(DOC_URL, { cache: 'no-store' as RequestCache });
    if (!res.ok) return null; // not configured yet / error → don't lock
    const data = (await res.json()) as {
      fields?: {
        enabled?: { booleanValue?: boolean };
        message?: { stringValue?: string };
      };
    };
    const enabled = data.fields?.enabled?.booleanValue;
    const message = data.fields?.message?.stringValue ?? DEFAULT_MESSAGE;
    // Default to enabled unless the flag is explicitly false.
    return { enabled: enabled !== false, message };
  } catch {
    return null;
  }
}

export function useRemoteGate(): GateState {
  const [state, setState] = useState<GateState>({
    ready: false,
    locked: false,
    message: DEFAULT_MESSAGE,
  });

  const apply = useCallback((s: RemoteStatus) => {
    setState({ ready: true, locked: !s.enabled, message: s.message });
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(s)).catch(() => {});
  }, []);

  const check = useCallback(async () => {
    const remote = await fetchStatus();
    if (remote) apply(remote);
  }, [apply]);

  useEffect(() => {
    let active = true;
    (async () => {
      // 1) Seed from cache for an instant (offline-safe) decision.
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw && active) {
          const s = JSON.parse(raw) as RemoteStatus;
          setState({
            ready: true,
            locked: !s.enabled,
            message: s.message ?? DEFAULT_MESSAGE,
          });
        } else if (active) {
          setState((p) => ({ ...p, ready: true }));
        }
      } catch {
        if (active) setState((p) => ({ ...p, ready: true }));
      }
      // 2) Refresh from Firebase.
      const remote = await fetchStatus();
      if (remote && active) apply(remote);
    })();

    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [apply, check]);

  return state;
}
