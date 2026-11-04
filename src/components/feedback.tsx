import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n/core';
import { makeStyles, useTheme } from '../theme';
import { useReducedMotion } from './motion';
import { Icon } from './ui';

type ToastKind = 'success' | 'error';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/** Short, non-blocking status messages ("Product saved", errors, ...). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { mode } = useTheme();
  const reduce = useReducedMotion();
  const [enter] = useState(() => new Animated.Value(0));
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 4500 : 2500);
  }, []);

  // Slide + fade in each time a message appears.
  useEffect(() => {
    if (!toast) return;
    enter.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.timing(enter, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [toast, enter, reduce]);
  const okColor = mode === 'dark' ? '#067647' : '#4ADE80';
  const badColor = mode === 'dark' ? '#B42318' : '#F87171';

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 10 }]}>
          <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[styles.toast, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}
          >
            <Icon name={toast.kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={20} color={toast.kind === 'error' ? badColor : okColor} />
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
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
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, maxWidth: 520, elevation: 6, backgroundColor: colors.toastSuccess, ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } as object) : null) },
  text: { color: colors.onToast, fontWeight: '500', fontSize: 14, flexShrink: 1 },
}));
