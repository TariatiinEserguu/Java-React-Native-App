import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from './Text';
import { useI18n } from '../i18n';
import { ModalFrame } from './ModalFrame';
import { useSheetStyles } from './Sheet';
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
  const styles = useSheetStyles();
  return (
    <ModalFrame
      visible={visible}
      onClose={onClose}
      dismissOnBackdrop={false}
      header={
        <View style={[styles.titleRow, { alignItems: 'center' }]}>
          <Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>
            {title}
          </Text>
          <Button title={t('common.close')} variant="ghost" small icon="close" onPress={onClose} />
        </View>
      }
    >
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
    </ModalFrame>
  );
}
