import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DataTable } from '../../components/DataTable';
import { confirmAction, useToast } from '../../components/feedback';
import { Badge, Button, Card, EmptyState, ErrorBanner, focusRing, LoadingState, SectionTitle, type PressState } from '../../components/ui';
import { useDataChange, useDbQuery } from '../../db/DataContext';
import { friendlyError } from '../../db/errors';
import { quoteIdent, resetDatabase } from '../../db/schema';
import { describeTable, listTables, readTablePage } from '../../db/sqlRunner';
import { useI18n } from '../../i18n';
import { makeStyles, monoFont, radius, useTheme } from '../../theme';

const PAGE_SIZE = 25;

export function TableBrowser({ onOpenInEditor }: { onOpenInEditor: (sql: string) => void }) {
  const { t, tn } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const toast = useToast();
  const [chosen, setSelected] = useState<string | null>('medicines');
  const [chosenPage, setPage] = useState(0);
  const [resetting, setResetting] = useState(false);

  const { data: tables, error } = useDbQuery(listTables);
  // Keep the selection valid when tables are dropped or rows deleted elsewhere.
  const selected = tables && !tables.some((tb) => tb.name === chosen) ? (tables[0]?.name ?? null) : chosen;
  const table = tables?.find((tb) => tb.name === selected);
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
    const ok = await confirmAction(t('sql.resetTitle'), t('sql.resetBody'), t('sql.reset'));
    if (!ok) return;
    setResetting(true);
    try {
      await resetDatabase(db);
      notifyChange();
      toast(t('sql.resetDone'));
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <View>
      {error ? <ErrorBanner message={error} /> : null}
      <SectionTitle>{t('sql.tables')}</SectionTitle>
      {!tables && !error ? <LoadingState /> : null}
      <View style={styles.tableGrid}>
        {tables?.map((item) => (
          <Pressable
            key={item.name}
            accessibilityRole="button"
            accessibilityState={{ selected: item.name === selected }}
            onPress={() => select(item.name)}
            style={(state: PressState) => [styles.tableItem, state.hovered && { backgroundColor: colors.surfaceAlt }, item.name === selected && styles.tableItemActive, focusRing(colors, state)]}
          >
            <Text style={[styles.tableName, item.name === selected && { color: colors.primary }]}>{item.name}</Text>
            <Text style={styles.tableMeta}>
              {item.type} · {item.rowCount === null ? '?' : tn('count.rows', item.rowCount)}
            </Text>
          </Pressable>
        ))}
      </View>
      {tables?.length === 0 ? <EmptyState icon="server-outline" text={t('sql.noTables')} /> : null}

      {table ? (
        <>
          <SectionTitle
            right={<Button title={t('sql.queryInEditor')} variant="ghost" small onPress={() => onOpenInEditor(`SELECT * FROM ${quoteIdent(table.name)} LIMIT 100;`)} />}
          >
            {t('sql.schema', { name: table.name })}
          </SectionTitle>
          {details ? (
            <DataTable
              columns={['#', t('sql.col.column'), t('sql.col.type'), t('sql.col.notNull'), t('sql.col.default'), 'PK']}
              rows={details.columns.map((c) => [c.cid, c.name, c.type || '—', c.notnull ? t('common.yes') : '', c.dflt_value, c.pk ? 'PK' : ''])}
            />
          ) : null}
          {details?.foreignKeys.length ? (
            <View style={styles.fkList}>
              {details.foreignKeys.map((fk, i) => (
                <Badge key={i} tone="info" label={t('sql.fk', { from: fk.from, table: fk.table, to: fk.to, action: fk.on_delete.toLowerCase() })} />
              ))}
            </View>
          ) : null}
          {table.sql ? (
            <Card style={styles.ddl}>
              <Text style={styles.ddlText}>{table.sql}</Text>
            </Card>
          ) : null}

          <SectionTitle>{t('sql.records')}</SectionTitle>
          {recordsError ? <ErrorBanner message={recordsError} /> : null}
          {records ? <DataTable columns={records.columns} rows={records.rows} /> : null}
          <View style={styles.pager}>
            <Button title={t('common.previous')} icon="chevron-back" variant="secondary" small disabled={page === 0} onPress={() => setPage(page - 1)} />
            <Text style={styles.pageText}>
              {t('sql.page', { page: page + 1, pages: pageCount })} · {table.rowCount === null ? '?' : tn('count.rows', table.rowCount)}
            </Text>
            <Button title={t('common.next')} icon="chevron-forward" variant="secondary" small disabled={page >= pageCount - 1} onPress={() => setPage(page + 1)} />
          </View>
        </>
      ) : null}

      <SectionTitle>{t('sql.maintenance')}</SectionTitle>
      <Card style={styles.danger}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dangerTitle}>{t('sql.resetHeading')}</Text>
          <Text style={styles.tableMeta}>{t('sql.resetHint')}</Text>
        </View>
        <Button title={t('sql.reset')} variant="danger" onPress={reset} loading={resetting} />
      </Card>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  danger: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: colors.danger },
  dangerTitle: { fontWeight: '600', color: colors.text },
}));
