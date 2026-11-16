import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { friendlyError } from './errors';
import { serialized } from './transaction';

type DataContextValue = { version: number; notifyChange: () => void };

const DataContext = createContext<DataContextValue>({ version: 0, notifyChange: () => {} });

/**
 * Holds a counter that is bumped after every write (from forms or the SQL editor).
 * Every visible screen re-queries when it changes, so all views reflect what is actually stored.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const notifyChange = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, notifyChange }), [version, notifyChange]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataChange() {
  return useContext(DataContext);
}

const ActivityContext = createContext(true);

/**
 * Marks a subtree as on screen or not. Tabs stay mounted while hidden; their queries skip the
 * refreshes that writes trigger and catch up once, when the tab is shown again.
 */
export function ScreenActivity({ active, children }: { active: boolean; children: ReactNode }) {
  const parent = useContext(ActivityContext);
  return <ActivityContext.Provider value={parent && active}>{children}</ActivityContext.Provider>;
}

/**
 * Loads data from SQLite and reloads it whenever `deps` change or a write is reported.
 * While reloading, the previous result stays on screen.
 */
export function useDbQuery<T>(load: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []) {
  const db = useSQLiteContext();
  const { version } = useDataChange();
  const active = useContext(ActivityContext);
  // The data version this query has caught up with. It only advances while the screen is visible.
  const [seen, setSeen] = useState(version);
  if (active && seen !== version) setSeen(version);

  const [state, setState] = useState<{ data?: T; error: string | null }>({ error: null });

  useEffect(() => {
    let current = true;
    // Queued behind any write in progress, so a half-finished transaction is never read.
    serialized(() => load(db))
      .then((data) => {
        if (current) setState({ data, error: null });
      })
      .catch((e) => {
        if (current) setState((s) => ({ data: s.data, error: friendlyError(e) }));
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, seen, ...deps]);

  return state;
}
