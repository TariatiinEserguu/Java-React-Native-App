import { useCallback, useState } from 'react';

import { useDataChange } from '../db/DataContext';
import { friendlyError } from '../db/errors';
import { ValidationError } from '../services/validate';
import { useToast } from './feedback';

/**
 * Form submission state: field errors from ValidationError, a banner for anything else,
 * and a refresh of every screen after a successful write.
 */
export function useSubmit() {
  const { notifyChange } = useDataChange();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setSaving(true);
      setErrors({});
      setError(null);
      try {
        const result = await action();
        notifyChange();
        return result;
      } catch (e) {
        if (e instanceof ValidationError) setErrors(e.fields);
        else setError(friendlyError(e));
        return undefined;
      } finally {
        setSaving(false);
      }
    },
    [notifyChange]
  );

  const reset = useCallback(() => {
    setErrors({});
    setError(null);
  }, []);

  return { errors, error, saving, submit, reset };
}

/** One-tap actions (deactivate, quarantine, ...): toast on success or failure. */
export function useAction() {
  const { notifyChange } = useDataChange();
  const toast = useToast();
  return useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        notifyChange();
        if (success) toast(success);
        return true;
      } catch (e) {
        toast(friendlyError(e), 'error');
        return false;
      }
    },
    [notifyChange, toast]
  );
}
