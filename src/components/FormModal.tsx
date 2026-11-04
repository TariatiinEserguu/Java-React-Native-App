import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { useI18n } from '../i18n';
import { makeStyles } from '../theme';
import { useReducedMotion } from './motion';
import { Button, ErrorBanner } from './ui';

export function FormModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
  error,
  onDelete,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  error?: string | null;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const centered = useWindowDimensions().width >= 700;
  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : centered ? 'fade' : 'slide'} transparent onRequestClose={onClose} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, centered && { justifyContent: 'center', padding: 24 }]}>
        <View style={[styles.sheet, centered && styles.dialog]}>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Button title={t('common.close')} variant="ghost" small icon="close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {error ? <ErrorBanner message={error} /> : null}
            {children}
          </ScrollView>
          <View style={styles.footer}>
            {onDelete ? <Button title={t('common.delete')} variant="danger" onPress={onDelete} disabled={submitting} /> : null}
            <View style={{ flex: 1 }} />
            <Button title={t('common.cancel')} variant="secondary" onPress={onClose} disabled={submitting} />
            <Button title={submitLabel ?? t('common.save')} onPress={onSubmit} loading={submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  dialog: { borderRadius: 16, borderBottomWidth: 1, maxHeight: '88%' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.text, flex: 1 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center' },
}));
