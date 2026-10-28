import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { makeStyles } from '../theme';
import { useReducedMotion } from './motion';
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
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'slide'} transparent onRequestClose={onClose} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Button title={t('common.close')} variant="ghost" small icon="close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, width: '100%', maxWidth: 640, maxHeight: '90%', borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: 'wrap', alignItems: 'center' },
}));
