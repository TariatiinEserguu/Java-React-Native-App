import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader, screen } from '../../components/ui';
import { DATABASE_NAME } from '../../db/schema';
import { colors } from '../../theme';
import { SqlEditor } from './SqlEditor';
import { TableBrowser } from './TableBrowser';

type Mode = 'editor' | 'browser';

export function DatabaseScreen() {
  const [mode, setMode] = useState<Mode>('editor');
  const [sql, setSql] = useState('SELECT * FROM products ORDER BY name;');

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Database" subtitle={`SQLite · ${DATABASE_NAME}`} />
      <View style={styles.segment}>
        {(
          [
            ['editor', 'SQL Editor'],
            ['browser', 'Table Browser'],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setMode(key)} style={[styles.segmentItem, mode === key && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === key && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Both stay mounted so editor results survive switching. */}
      <View style={mode === 'editor' ? null : styles.hidden}>
        <SqlEditor sql={sql} onChangeSql={setSql} />
      </View>
      <View style={mode === 'browser' ? null : styles.hidden}>
        <TableBrowser
          onOpenInEditor={(query) => {
            setSql(query);
            setMode('editor');
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: '#E6E9F0', borderRadius: 10, padding: 3, marginBottom: 14 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.text },
  hidden: { display: 'none' },
});
