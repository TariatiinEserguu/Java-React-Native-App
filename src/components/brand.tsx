import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import { Icon, type IconName } from './ui';

/** The pharmacy cross: the sign every pharmacy hangs outside. */
export function PharmacyCross({ size = 22, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const fill = color ?? colors.primary;
  const arm = size * 0.36;
  const corner = size * 0.08;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ position: 'absolute', left: (size - arm) / 2, top: 0, width: arm, height: size, borderRadius: corner, backgroundColor: fill }} />
      <View style={{ position: 'absolute', top: (size - arm) / 2, left: 0, width: size, height: arm, borderRadius: corner, backgroundColor: fill }} />
    </View>
  );
}

/**
 * A small drawing of the medicine's dosage form, so a capsule, a syrup and a cream are told apart
 * at a glance in long lists. Forms without a distinct shape fall back to an icon.
 */
export function FormGlyph({ form, size = 40, rx }: { form: string; size?: number; rx?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ink = colors.muted;
  const s = size / 40; // drawn on a 40-point grid
  const line = Math.max(1.5, 1.5 * s);
  const tile: ViewStyle = { width: size, height: size, borderRadius: size * 0.28, backgroundColor: rx ? colors.rxSoft : colors.surfaceAlt };
  const stroke = rx ? colors.rx : ink;

  let drawing: ReactNode;
  switch (form) {
    case 'TABLET':
      // A tablet seen at an angle: the flat face over its edge. (A round face with a score line
      // read as a "minus" button next to the Add button.)
      drawing = (
        <View style={{ width: 24 * s, height: 17 * s, transform: [{ rotate: '-12deg' }] }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 5 * s, height: 12 * s, borderRadius: 6 * s, backgroundColor: stroke }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 12 * s, borderRadius: 6 * s, borderWidth: line, borderColor: stroke, backgroundColor: colors.surface }} />
        </View>
      );
      break;
    case 'CAPSULE':
      drawing = (
        <View style={{ flexDirection: 'row', transform: [{ rotate: '-35deg' }] }}>
          <View style={{ width: 12 * s, height: 11 * s, borderTopLeftRadius: 6 * s, borderBottomLeftRadius: 6 * s, backgroundColor: stroke }} />
          <View
            style={{ width: 12 * s, height: 11 * s, borderTopRightRadius: 6 * s, borderBottomRightRadius: 6 * s, borderWidth: line, borderLeftWidth: 0, borderColor: stroke, backgroundColor: colors.surface }}
          />
        </View>
      );
      break;
    case 'SYRUP':
    case 'SUSPENSION':
    case 'DROPS': {
      const narrow = form === 'DROPS';
      drawing = (
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: (narrow ? 4 : 8) * s, height: 4 * s, borderRadius: 1 * s, backgroundColor: stroke }} />
          <View style={{ width: (narrow ? 4 : 6) * s, height: 3 * s, borderLeftWidth: line, borderRightWidth: line, borderColor: stroke }} />
          <View style={[styles.center, { width: (narrow ? 12 : 16) * s, height: (narrow ? 14 : 17) * s, borderRadius: 3 * s, borderWidth: line, borderColor: stroke, backgroundColor: colors.surface }]}>
            <View style={{ width: (narrow ? 6 : 9) * s, height: 5 * s, borderRadius: 1 * s, backgroundColor: stroke, opacity: 0.35 }} />
          </View>
        </View>
      );
      break;
    }
    case 'INJECTION':
      drawing = (
        <View style={{ alignItems: 'center', transform: [{ rotate: '25deg' }] }}>
          <View style={{ width: 5 * s, height: 6 * s, borderTopLeftRadius: 3 * s, borderTopRightRadius: 3 * s, backgroundColor: stroke }} />
          <View style={{ width: 3 * s, height: 2.5 * s, backgroundColor: stroke }} />
          <View style={{ width: 9 * s, height: 16 * s, borderRadius: 3 * s, borderWidth: line, borderColor: stroke, backgroundColor: colors.surface }} />
        </View>
      );
      break;
    case 'CREAM':
    case 'OINTMENT':
      drawing = (
        <View style={{ flexDirection: 'row', alignItems: 'center', transform: [{ rotate: '-35deg' }] }}>
          <View style={{ width: 3 * s, height: 13 * s, backgroundColor: stroke, borderRadius: 1 * s }} />
          <View style={{ width: 17 * s, height: 11 * s, borderTopRightRadius: 3 * s, borderBottomRightRadius: 3 * s, borderWidth: line, borderLeftWidth: 0, borderColor: stroke, backgroundColor: colors.surface }} />
          <View style={{ width: 5 * s, height: 7 * s, borderRadius: 1.5 * s, backgroundColor: stroke }} />
        </View>
      );
      break;
    case 'SPRAY':
    case 'INHALER':
      drawing = (
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ width: 6 * s, height: 5 * s, backgroundColor: stroke, borderTopLeftRadius: 2 * s }} />
            <View style={{ width: 4 * s, height: 2.5 * s, backgroundColor: stroke, marginBottom: 2.5 * s }} />
          </View>
          <View style={{ width: 12 * s, height: 18 * s, borderRadius: 4 * s, borderWidth: line, borderColor: stroke, backgroundColor: colors.surface }} />
        </View>
      );
      break;
    case 'POWDER':
      drawing = (
        <View style={{ width: 18 * s, height: 20 * s, borderRadius: 2 * s, borderWidth: line, borderColor: stroke, backgroundColor: colors.surface, overflow: 'hidden' }}>
          <View style={{ height: 4 * s, backgroundColor: stroke, opacity: 0.35 }} />
        </View>
      );
      break;
    default: {
      const icon: IconName = form === 'DEVICE' ? 'thermometer-outline' : 'medkit-outline';
      drawing = <Icon name={icon} size={20 * s} color={stroke} />;
    }
  }

  return <View style={[styles.center, tile]}>{drawing}</View>;
}

const useStyles = makeStyles(() => ({
  center: { alignItems: 'center', justifyContent: 'center' },
}));
