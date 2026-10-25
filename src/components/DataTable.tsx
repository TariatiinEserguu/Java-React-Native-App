import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatCell } from '../format';
import { colors, monoFont } from '../theme';

const MIN_WIDTH = 70;
const MAX_WIDTH = 260;
const CHAR_WIDTH = 7.5;

/** Generic, horizontally scrollable result grid with column headers. */
export function DataTable({ columns, rows, maxRows = 200 }: { columns: string[]; rows: unknown[][]; maxRows?: number }) {
  const shown = rows.slice(0, maxRows);
  const widths = columns.map((col, c) => {
    const longest = shown.reduce<number>((max, row) => Math.max(max, formatCell(row[c]).length), col.length);
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest * CHAR_WIDTH + 20));
  });

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={[styles.row, styles.headerRow]}>
            {columns.map((col, c) => (
              <Text key={c} numberOfLines={1} style={[styles.cell, styles.headerCell, { width: widths[c] }]}>
                {col}
              </Text>
            ))}
          </View>
          {shown.map((row, r) => (
            <View key={r} style={[styles.row, r % 2 === 1 && styles.zebra]}>
              {columns.map((_, c) => {
                const value = row[c];
                return (
                  <Text
                    key={c}
                    numberOfLines={1}
                    style={[styles.cell, { width: widths[c] }, value === null && styles.null, typeof value === 'number' && styles.number]}
                  >
                    {formatCell(value)}
                  </Text>
                );
              })}
            </View>
          ))}
          {shown.length === 0 ? <Text style={styles.empty}>No rows</Text> : null}
        </View>
      </ScrollView>
      {rows.length > shown.length ? (
        <Text style={styles.more}>
          Showing first {shown.length} of {rows.length} rows
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerRow: { backgroundColor: '#EEF1F7' },
  zebra: { backgroundColor: '#FAFBFD' },
  cell: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: monoFont, color: colors.text },
  headerCell: { fontWeight: '700', color: colors.muted },
  null: { color: colors.muted, fontStyle: 'italic' },
  number: { textAlign: 'right' },
  empty: { padding: 12, color: colors.muted, fontStyle: 'italic' },
  more: { padding: 8, fontSize: 12, color: colors.muted, borderTopWidth: 1, borderTopColor: colors.border },
});
