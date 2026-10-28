import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { makeStyles, radius, useTheme } from '../theme';
import { useReducedMotion } from './motion';
import { Button, focusRing, Icon, SearchBar, useStyles as useUi, type PressState } from './ui';

export type Option<T> = { value: T; label: string; detail?: string; disabled?: boolean };

/** A cross-platform dropdown: tapping opens a searchable list in a modal. */
export function SelectField<T>({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const ui = useUi();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder ?? t('common.select') }}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={(state: PressState) => [
          ui.input,
          styles.trigger,
          error ? ui.inputError : null,
          state.hovered && { borderColor: colors.muted },
          focusRing(colors, state),
        ]}
      >
        <Text numberOfLines={1} style={[styles.triggerText, { color: selected ? colors.text : colors.muted }]}>
          {selected?.label ?? placeholder ?? t('common.select')}
        </Text>
        <Icon name="chevron-down" size={18} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={ui.errorText}>
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={close} accessibilityViewIsModal>
        <View style={styles.backdrop}>
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.title}>
              {label}
            </Text>
            {options.length > 6 ? <SearchBar value={query} onChangeText={setQuery} placeholder={t('common.searchPlaceholder')} /> : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => String(o.value)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.noMatch}>{t('common.noMatches')}</Text>}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: item.value === value, disabled: !!item.disabled }}
                  disabled={item.disabled}
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  style={(state: PressState) => [
                    styles.option,
                    state.hovered && { backgroundColor: colors.surfaceAlt },
                    item.value === value && styles.optionSelected,
                    item.disabled && { opacity: 0.4 },
                    state.pressed && { backgroundColor: colors.surfaceAlt },
                    focusRing(colors, state),
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{item.label}</Text>
                    {item.detail ? <Text style={styles.optionDetail}>{item.detail}</Text> : null}
                  </View>
                  {item.value === value ? <Icon name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
            <Button title={t('common.cancel')} variant="secondary" onPress={close} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  triggerText: { fontSize: 15, flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20, alignItems: 'center' },
  panel: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, maxHeight: '80%', width: '100%', maxWidth: 480, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10, color: colors.text },
  option: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionLabel: { fontSize: 15, color: colors.text },
  optionDetail: { fontSize: 12, color: colors.muted, marginTop: 2 },
  noMatch: { textAlign: 'center', color: colors.muted, paddingVertical: 16 },
}));
