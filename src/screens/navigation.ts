import { useState } from 'react';

/**
 * Switches tab, optionally with an intent for the screen that opens: e.g. Today's "Expired batches"
 * row opens Inventory already filtered to expired stock.
 */
export type Navigate = (tab: string, intent?: string) => void;

/** An intent handed to a tab. `id` changes on every request, so asking twice still applies it. */
export type Intent = { value: string; id: number };

/** Calls `apply` once for every new intent (during render, as React recommends for derived state). */
export function useIntent(intent: Intent | null | undefined, apply: (value: string) => void) {
  const [seen, setSeen] = useState(0);
  if (intent && intent.id !== seen) {
    setSeen(intent.id);
    apply(intent.value);
  }
}
