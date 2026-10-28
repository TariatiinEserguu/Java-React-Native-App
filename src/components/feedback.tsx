import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n/core';
import { makeStyles, useTheme } from '../theme';
import { Icon } from './ui';

type ToastKind = 'success' | 'error';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** Short, non-blocking status messages ("Product saved", errors, ...). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 4500 : 2500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 10 }]}>
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[styles.toast, toast.kind === 'error' ? styles.error : styles.success]}
          >
            <Icon name={toast.kind === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={colors.onToast} />
            <Text style={styles.text}>{toast.message}</Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Destructive-action confirmation. Alert buttons are not supported on web, so it falls back to window.confirm. */
export function confirmAction(title: string, message: string, confirmLabel = t('common.delete')): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

const useStyles = makeStyles((colors) => ({
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, maxWidth: 520, elevation: 4 },
  success: { backgroundColor: colors.toastSuccess },
  error: { backgroundColor: colors.toastDanger },
  text: { color: colors.onToast, fontWeight: '600', flexShrink: 1 },
}));
