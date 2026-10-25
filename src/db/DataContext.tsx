import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { friendlyError } from './errors';

type DataContextValue = { version: number; notifyChange: () => void };

const DataContext = createContext<DataContextValue>({ version: 0, notifyChange: () => {} });

/**
 * Holds a counter that is bumped after every write (from forms or the SQL editor).
 * Every screen re-queries when it changes, so all views reflect what is actually stored.
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

/** Loads data from SQLite and reloads it whenever `deps` change or any write is reported. */
export function useDbQuery<T>(load: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []) {
  const db = useSQLiteContext();
  const { version } = useDataChange();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    load(db)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((e) => active && setError(friendlyError(e)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);

  return { data, error };
}
