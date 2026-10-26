import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Button title="Close" variant="ghost" small onPress={onClose} />
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, width: '100%', maxWidth: 640, maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: 'wrap', alignItems: 'center' },
});
