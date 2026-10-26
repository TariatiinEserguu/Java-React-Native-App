import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getSettings } from './services/settings';
import type { SessionUser } from './services/permissions';
import { login as loginService } from './services/users';

type SessionValue = {
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Call on user interaction; the session locks after `auto_lock_minutes` without it. */
  touch: () => void;
};

const SessionContext = createContext<SessionValue>({ user: null, login: async () => {}, logout: () => {}, touch: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [user, setUser] = useState<SessionUser | null>(null);
  const lastActivity = useRef(0);

  const login = useCallback(
    async (username: string, password: string) => {
      const u = await loginService(db, username, password);
      lastActivity.current = Date.now();
      setUser(u);
    },
    [db]
  );
  const logout = useCallback(() => setUser(null), []);
  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(async () => {
      const { auto_lock_minutes } = await getSettings(db);
      if (Date.now() - lastActivity.current > auto_lock_minutes * 60_000) setUser(null);
    }, 30_000);
    return () => clearInterval(timer);
  }, [db, user]);

  const value = useMemo(() => ({ user, login, logout, touch }), [user, login, logout, touch]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

/** The logged-in user. Only used by screens that render after login. */
export function useUser(): SessionUser {
  const { user } = useContext(SessionContext);
  if (!user) throw new Error('No user is logged in.');
  return user;
}
