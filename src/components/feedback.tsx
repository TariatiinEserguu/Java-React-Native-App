import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n/core';
import { makeStyles, useTheme } from '../theme';
import { spring, springTo, usePresence, useAnimatedNumber } from './motion';
import { Icon } from './ui';

type ToastKind = 'success' | 'error';
type Toast = { message: string; kind: ToastKind; id: number; replacing: boolean };
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

/**
 * Short, non-blocking status messages ("Product saved", errors, ...). A toast drops in from the top,
 * a new one arriving while it is shown gives it a small bump instead of stacking, and it slides
 * away when its time is up or when tapped.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { mode } = useTheme();
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counter = useRef(0);
  const showing = useRef(false);
  const { mounted, progress, reduce } = usePresence(visible, 'spring');
  const bump = useAnimatedNumber(1);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    clearTimeout(timer.current);
    counter.current += 1;
    setToast({ message, kind, id: counter.current, replacing: showing.current });
    showing.current = true;
    setVisible(true);
    timer.current = setTimeout(() => {
      showing.current = false;
      setVisible(false);
    }, kind === 'error' ? 4500 : 2500);
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    showing.current = false;
    setVisible(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A message replacing one that is still on screen: pulse instead of re-entering.
  const id = toast?.id;
  const replacing = toast?.replacing;
  useEffect(() => {
    if (!replacing || reduce) return;
    bump.setValue(1.05);
    const animation = springTo(bump, 1, spring.pop);
    animation.start();
    return () => animation.stop();
  }, [id, replacing, reduce, bump]);

  const okColor = mode === 'dark' ? '#067647' : '#4ADE80';
  const badColor = mode === 'dark' ? '#B42318' : '#F87171';

  return (
    <ToastContext.Provider value={show}>
      {children}
      {mounted && toast ? (
        <View pointerEvents="box-none" style={[styles.toastWrap, { top: insets.top + 10 }]}>
          <Animated.View
            style={{
              opacity: progress,
              transform: reduce
                ? []
                : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }, { scale: Animated.multiply(bump, progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })) }],
            }}
          >
            <Pressable
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              accessibilityHint={t('common.close')}
              onPress={dismiss}
              style={[styles.toast, toast.kind === 'error' && styles.toastError]}
            >
              <Icon name={toast.kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={20} color={toast.kind === 'error' ? badColor : okColor} />
              <Text style={styles.text}>{toast.message}</Text>
            </Pressable>
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
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    maxWidth: 520,
    elevation: 6,
    backgroundColor: colors.toastSuccess,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.18)', cursor: 'pointer' } as object) : null),
  },
  toastError: { backgroundColor: colors.toastDanger },
  text: { color: colors.onToast, fontWeight: '500', fontSize: 14, flexShrink: 1 },
}));
