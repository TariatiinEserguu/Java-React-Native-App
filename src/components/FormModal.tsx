import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { Button, ErrorBanner } from './ui';

export function FormModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Button title="Close" variant="ghost" small onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {error ? <ErrorBanner message={error} /> : null}
            {children}
          </ScrollView>
          <View style={styles.footer}>
            {onDelete ? <Button title="Delete" variant="danger" onPress={onDelete} disabled={submitting} /> : null}
            <View style={{ flex: 1 }} />
            <Button title="Cancel" variant="secondary" onPress={onClose} disabled={submitting} />
            <Button title={submitLabel} onPress={onSubmit} loading={submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
});
