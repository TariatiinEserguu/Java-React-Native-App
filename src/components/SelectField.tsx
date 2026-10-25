import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';
import { Button, SearchBar, styles as ui } from './ui';

export type Option<T> = { value: T; label: string; detail?: string; disabled?: boolean };

/** A cross-platform dropdown: tapping opens a searchable list in a modal. */
export function SelectField<T>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  error,
}: {
  label: string;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[ui.input, error ? ui.inputError : null]}>
        <Text style={{ color: selected ? colors.text : colors.muted, fontSize: 15 }}>{selected?.label ?? placeholder}</Text>
      </Pressable>
      {error ? <Text style={ui.errorText}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.panel}>
            <Text style={styles.title}>{label}</Text>
            {options.length > 6 ? <SearchBar value={query} onChangeText={setQuery} placeholder="Search…" /> : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => String(o.value)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  disabled={item.disabled}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    item.value === value && styles.optionSelected,
                    item.disabled && { opacity: 0.4 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  {item.detail ? <Text style={styles.optionDetail}>{item.detail}</Text> : null}
                </Pressable>
              )}
            />
            <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 20, alignItems: 'center' },
  panel: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, maxHeight: '80%', width: '100%', maxWidth: 480 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 10, color: colors.text },
  option: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionLabel: { fontSize: 15, color: colors.text },
  optionDetail: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
