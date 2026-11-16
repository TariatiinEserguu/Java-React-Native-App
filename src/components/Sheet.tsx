import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from './Text';
import { useI18n } from '../i18n';
import { makeStyles } from '../theme';
import { ModalFrame } from './ModalFrame';
import { Button } from './ui';

/** Bottom sheet for detail views (FormModal is the variant with Save/Cancel). */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const styles = useSheetStyles();
  return (
    <ModalFrame
      visible={visible}
      onClose={onClose}
      header={
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Button title={t('common.close')} variant="ghost" small icon="close" onPress={onClose} />
        </View>
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </ModalFrame>
  );
}

/** Shared by Sheet and FormModal so both headers and footers line up. */
export const useSheetStyles = makeStyles((colors) => ({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: 'wrap', alignItems: 'center' },
}));
