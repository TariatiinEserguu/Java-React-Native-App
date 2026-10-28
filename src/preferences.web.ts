// Web build of the preference store: plain localStorage (blocked or full storage is tolerated).

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}
