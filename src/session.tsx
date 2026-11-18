import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { friendlyError } from './db/errors';
import { serialized } from './db/transaction';
import { getSettings } from './services/settings';
import type { SessionUser } from './services/permissions';
import { createFirstAdministrator, hasAccounts, login as loginService, type FirstAdministratorInput } from './services/users';

type SessionValue = {
  user: SessionUser | null;
  needsSetup: boolean | null;
  setupError: string | null;
  retrySetupCheck: () => void;
  createAdministrator: (input: FirstAdministratorInput) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Call on user interaction; the session locks after `auto_lock_minutes` without it. */
  touch: () => void;
};

const SessionContext = createContext<SessionValue>({
  user: null,
  needsSetup: null,
  setupError: null,
  retrySetupCheck: () => {},
  createAdministrator: async () => {},
  login: async () => {},
  logout: () => {},
  touch: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [accountCheck, setAccountCheck] = useState(0);
  const lastActivity = useRef(0);

  const retrySetupCheck = useCallback(() => {
    setSetupError(null);
    setAccountCheck((current) => current + 1);
  }, []);

  useEffect(() => {
    if (user) return;
    let current = true;
    serialized(() => hasAccounts(db)).then(
      (exists) => {
        if (current) setNeedsSetup(!exists);
      },
      (error: unknown) => {
        if (current) setSetupError(friendlyError(error));
      }
    );
    return () => {
      current = false;
    };
  }, [accountCheck, db, user]);

  const login = useCallback(
    async (username: string, password: string) => {
      const u = await loginService(db, username, password);
      lastActivity.current = Date.now();
      setNeedsSetup(false);
      setUser(u);
    },
    [db]
  );
  const createAdministrator = useCallback(
    async (input: FirstAdministratorInput) => {
      try {
        await createFirstAdministrator(db, input);
        await login(input.username, input.password);
      } catch (error) {
        // Another tab may have completed setup, or the account may exist after a failed sign-in.
        retrySetupCheck();
        throw error;
      }
    },
    [db, login, retrySetupCheck]
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

  const value = useMemo(
    () => ({ user, needsSetup, setupError, retrySetupCheck, createAdministrator, login, logout, touch }),
    [user, needsSetup, setupError, retrySetupCheck, createAdministrator, login, logout, touch]
  );
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
