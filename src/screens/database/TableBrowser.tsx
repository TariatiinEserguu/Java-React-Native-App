import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DataTable } from '../../components/DataTable';
import { confirmAction, useToast } from '../../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBanner, SectionTitle } from '../../components/ui';
import { useDataChange, useDbQuery } from '../../db/DataContext';
import { friendlyError } from '../../db/errors';
import { quoteIdent, resetDatabase } from '../../db/schema';
import { describeTable, listTables, readTablePage } from '../../db/sqlRunner';
import { colors, monoFont, radius } from '../../theme';

const PAGE_SIZE = 25;

export function TableBrowser({ onOpenInEditor }: { onOpenInEditor: (sql: string) => void }) {
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const toast = useToast();
  const [chosen, setSelected] = useState<string | null>('medicines');
  const [chosenPage, setPage] = useState(0);
  const [resetting, setResetting] = useState(false);

  const { data: tables, error } = useDbQuery(listTables);
  // Keep the selection valid when tables are dropped or rows deleted elsewhere.
  const selected = tables && !tables.some((t) => t.name === chosen) ? (tables[0]?.name ?? null) : chosen;
  const table = tables?.find((t) => t.name === selected);
  const pageCount = Math.max(1, Math.ceil((table?.rowCount ?? 0) / PAGE_SIZE));
  const page = Math.min(chosenPage, pageCount - 1);

  const { data: details } = useDbQuery((db) => (selected ? describeTable(db, selected) : Promise.resolve(null)), [selected]);
  const { data: records, error: recordsError } = useDbQuery(
    (db) => (selected ? readTablePage(db, selected, PAGE_SIZE, page * PAGE_SIZE) : Promise.resolve(null)),
    [selected, page]
  );

  const select = (name: string) => {
    setSelected(name);
    setPage(0);
  };

  const reset = async () => {
    const ok = await confirmAction(
      'Reset database?',
      'All tables (including ones you created) will be dropped and the sample data restored.',
      'Reset'
    );
    if (!ok) return;
    setResetting(true);
    try {
      await resetDatabase(db);
      notifyChange();
      toast('Database reset to sample data');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <View>
      {error ? <ErrorBanner message={error} /> : null}
      <SectionTitle>Tables & views</SectionTitle>
      <View style={styles.tableGrid}>
        {tables?.map((t) => (
          <Pressable key={t.name} onPress={() => select(t.name)} style={[styles.tableItem, t.name === selected && styles.tableItemActive]}>
            <Text style={[styles.tableName, t.name === selected && { color: colors.primary }]}>{t.name}</Text>
            <Text style={styles.tableMeta}>
              {t.type} · {t.rowCount === null ? '?' : t.rowCount} rows
            </Text>
          </Pressable>
        ))}
      </View>
      {tables?.length === 0 ? <EmptyState text="The database has no tables." /> : null}

      {table ? (
        <>
          <SectionTitle
            right={<Button title="Query in editor" variant="ghost" small onPress={() => onOpenInEditor(`SELECT * FROM ${quoteIdent(table.name)} LIMIT 100;`)} />}
          >
            Schema · {table.name}
          </SectionTitle>
          {details ? (
            <DataTable
              columns={['#', 'Column', 'Type', 'Not null', 'Default', 'PK']}
              rows={details.columns.map((c) => [c.cid, c.name, c.type || '—', c.notnull ? 'YES' : '', c.dflt_value, c.pk ? 'PK' : ''])}
            />
          ) : null}
          {details?.foreignKeys.length ? (
            <View style={styles.fkList}>
              {details.foreignKeys.map((fk, i) => (
                <Badge key={i} tone="info" label={`${fk.from} → ${fk.table}.${fk.to} (on delete ${fk.on_delete.toLowerCase()})`} />
              ))}
            </View>
          ) : null}
          {table.sql ? (
            <Card style={styles.ddl}>
              <Text style={styles.ddlText}>{table.sql}</Text>
            </Card>
          ) : null}

          <SectionTitle>Records</SectionTitle>
          {recordsError ? <ErrorBanner message={recordsError} /> : null}
          {records ? <DataTable columns={records.columns} rows={records.rows} /> : null}
          <View style={styles.pager}>
            <Button title="‹ Prev" variant="secondary" small disabled={page === 0} onPress={() => setPage(page - 1)} />
            <Text style={styles.pageText}>
              Page {page + 1} of {pageCount} · {table.rowCount ?? '?'} rows
            </Text>
            <Button title="Next ›" variant="secondary" small disabled={page >= pageCount - 1} onPress={() => setPage(page + 1)} />
          </View>
        </>
      ) : null}

      <SectionTitle>Maintenance</SectionTitle>
      <Card style={styles.danger}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dangerTitle}>Reset to sample data</Text>
          <Text style={styles.tableMeta}>Drops every table and re-creates the original schema and records.</Text>
        </View>
        <Button title="Reset" variant="danger" onPress={reset} loading={resetting} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tableItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 120,
  },
  tableItemActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tableName: { fontFamily: monoFont, fontWeight: '700', color: colors.text },
  tableMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  fkList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ddl: { backgroundColor: colors.codeBg, borderColor: colors.codeBg, marginTop: 8 },
  ddlText: { fontFamily: monoFont, fontSize: 12, color: colors.codeText },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  pageText: { fontSize: 13, color: colors.muted },
  danger: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: colors.dangerSoft },
  dangerTitle: { fontWeight: '600', color: colors.text },
});
