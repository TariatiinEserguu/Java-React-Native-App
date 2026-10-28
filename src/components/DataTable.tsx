import { ScrollView, Text, View } from 'react-native';

import { formatCell } from '../format';
import { useI18n } from '../i18n';
import { makeStyles, monoFont } from '../theme';

const MIN_WIDTH = 70;
const MAX_WIDTH = 260;
const CHAR_WIDTH = 8.4;

/** Generic, horizontally scrollable result grid with column headers. */
export function DataTable({ columns, rows, maxRows = 200 }: { columns: string[]; rows: unknown[][]; maxRows?: number }) {
  const { t } = useI18n();
  const styles = useStyles();
  const shown = rows.slice(0, maxRows);
  const widths = columns.map((col, c) => {
    const longest = shown.reduce<number>((max, row) => Math.max(max, formatCell(row[c]).length), col.length);
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest * CHAR_WIDTH + 28));
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
          {shown.length === 0 ? <Text style={styles.empty}>{t('table.noRows')}</Text> : null}
        </View>
      </ScrollView>
      {rows.length > shown.length ? <Text style={styles.more}>{t('table.showingFirst', { shown: shown.length, total: rows.length })}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { backgroundColor: colors.surfaceAlt },
  zebra: { backgroundColor: colors.bg },
  cell: { paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: monoFont, color: colors.text },
  headerCell: { fontWeight: '700', color: colors.muted },
  null: { color: colors.muted, fontStyle: 'italic' },
  number: { textAlign: 'right' },
  empty: { padding: 12, color: colors.muted, fontStyle: 'italic' },
  more: { padding: 8, fontSize: 12, color: colors.muted, borderTopWidth: 1, borderTopColor: colors.border },
}));
