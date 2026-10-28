import { Storage } from 'expo-sqlite/kv-store';

// Small synchronous key-value store for per-device UI preferences (language, theme).
// Synchronous reads let the saved choice apply on the very first render, so the app never flashes
// the wrong theme or language. Every call is guarded: preferences are a convenience, not required.

export function readPreference(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string) {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}
