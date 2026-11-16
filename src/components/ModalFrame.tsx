import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, radiusLg, useTheme } from '../theme';
import { Freeze, spring, springTo, useAnimatedNumber, usePresence } from './motion';

/** From this width sheets open as centred dialogs instead of rising from the bottom. */
export const DIALOG_BREAKPOINT = 700;

/**
 * The animated shell behind Sheet, FormModal and SelectField.
 *
 * - Phones: a bottom sheet that springs up, can be dragged down by its header to close, and
 *   slides away on close. The dimmed backdrop fades separately, so it never slides with the sheet.
 * - Wide screens and `variant="dialog"`: a centred dialog that fades and scales in.
 * - Closing keeps the content on screen (frozen) until the exit animation ends.
 */
export function ModalFrame({
  visible,
  onClose,
  header,
  children,
  variant = 'sheet',
  dismissOnBackdrop = true,
  panelStyle,
}: {
  visible: boolean;
  onClose: () => void;
  /** Title row. On phones it doubles as the drag handle. */
  header?: ReactNode;
  children: ReactNode;
  variant?: 'sheet' | 'dialog';
  /** Forms turn this off so a stray tap outside doesn't throw away what was typed. */
  dismissOnBackdrop?: boolean;
  panelStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const centered = variant === 'dialog' || width >= DIALOG_BREAKPOINT;
  const { mounted, progress, reduce } = usePresence(visible, centered ? 'timing' : 'spring');
  const drag = useAnimatedNumber(0);
  const panelHeight = useAnimatedNumber(height);
  const [measured, setMeasured] = useState(height);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: () => drag.stopAnimation(),
        // Downwards follows the finger; upwards resists.
        onPanResponderMove: (_e, g) => drag.setValue(g.dy > 0 ? g.dy : g.dy / 5),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > Math.min(140, measured * 0.3) || g.vy > 1.1) onClose();
          else springTo(drag, 0, spring.sheet).start();
        },
        onPanResponderTerminate: () => springTo(drag, 0, spring.sheet).start(),
      }),
    [drag, measured, onClose]
  );

  // A sheet dragged down and closed starts from the top again next time.
  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);

  if (!mounted) return null;

  const sheetMotion = !centered && !reduce;
  const backdropOpacity = sheetMotion
    ? Animated.multiply(progress, drag.interpolate({ inputRange: [0, 400], outputRange: [1, 0.35], extrapolate: 'clamp' }))
    : progress;
  const panelMotion = sheetMotion
    ? { transform: [{ translateY: Animated.add(Animated.multiply(Animated.subtract(1, progress), panelHeight), drag) }] }
    : centered && !reduce
      ? {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        }
      : { opacity: progress };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdropOpacity }]} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissOnBackdrop ? onClose : undefined}
          accessible={false}
          importantForAccessibility="no"
          // Keeps the backdrop out of the keyboard tab order on web.
          tabIndex={-1}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={[styles.container, centered ? styles.containerCentered : styles.containerBottom]}
        >
          <Animated.View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              panelHeight.setValue(h + 24);
              setMeasured(h);
            }}
            style={[styles.panel, centered ? styles.dialog : styles.sheet, panelStyle, panelMotion]}
          >
            <Freeze frozen={!visible}>
              {centered ? (
                header
              ) : (
                <View {...pan.panHandlers}>
                  <View style={styles.grabberZone}>
                    <View style={styles.grabber} />
                  </View>
                  {header}
                </View>
              )}
              {children}
            </Freeze>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1 },
  container: { flex: 1, alignItems: 'center' },
  containerBottom: { justifyContent: 'flex-end' },
  containerCentered: { justifyContent: 'center', padding: 24 },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    width: '100%',
    maxWidth: 640,
    padding: 18,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as object) : null),
  },
  sheet: { borderTopLeftRadius: radiusLg + 6, borderTopRightRadius: radiusLg + 6, borderBottomWidth: 0, maxHeight: '90%', paddingTop: 6, elevation: 12 },
  dialog: { borderRadius: radiusLg + 4, maxHeight: '88%', elevation: 12 },
  grabberZone: { alignItems: 'center', paddingTop: 2, paddingBottom: 10 },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, opacity: 0.6 },
}));
