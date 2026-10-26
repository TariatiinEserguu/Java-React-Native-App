import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DataTable } from '../../components/DataTable';
import { Badge, Button, Card, Chip, EmptyState, SectionTitle } from '../../components/ui';
import { useDataChange, useDbQuery } from '../../db/DataContext';
import { addHistory, clearHistory, listHistory, runScript, type RunOutcome, type StatementResult } from '../../db/sqlRunner';
import { dateTime } from '../../format';
import { colors, monoFont, radius } from '../../theme';
import { EXAMPLE_QUERIES } from './examples';

export function SqlEditor({ sql, onChangeSql }: { sql: string; onChangeSql: (sql: string) => void }) {
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const { data: history } = useDbQuery(listHistory);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!sql.trim()) return;
    setRunning(true);
    try {
      const result = await runScript(db, sql);
      setOutcome(result);
      if (result.results.length || result.error) {
        await addHistory(db, sql, result.error ? 'error' : 'success').catch(() => {});
      }
    } finally {
      setRunning(false);
      // Always refresh: the script may have written data, and history changed.
      notifyChange();
    }
  };

  const total = outcome ? outcome.results.length + (outcome.error ? 1 : 0) : 0;

  return (
    <View>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <TextInput
          value={sql}
          onChangeText={onChangeSql}
          multiline
          placeholder="Write SQL here, e.g. SELECT * FROM medicines;"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          style={styles.editor}
        />
        <View style={styles.toolbar}>
          <Text style={styles.toolbarHint}>Separate multiple statements with ;</Text>
          <View style={{ flex: 1 }} />
          <Button title="Clear" variant="secondary" small onPress={() => { onChangeSql(''); setOutcome(null); }} />
          <Button title="▶ Run" small onPress={run} loading={running} disabled={!sql.trim()} />
        </View>
      </Card>

      <SectionTitle>Examples</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {EXAMPLE_QUERIES.map((q) => (
          <Chip key={q.label} label={q.label} onPress={() => onChangeSql(q.sql)} />
        ))}
      </ScrollView>

      {outcome ? (
        <>
          <SectionTitle>Result</SectionTitle>
          {outcome.error ? (
            <View style={[styles.status, styles.statusError]}>
              <Text style={[styles.statusTitle, { color: colors.danger }]}>
                ✕ Error in statement {outcome.error.index + 1} of {total}
              </Text>
              <Text style={[styles.statusText, { color: colors.danger }]}>{outcome.error.message}</Text>
              <Text style={styles.failedSql} numberOfLines={4}>
                {outcome.error.statement}
              </Text>
              {outcome.results.length ? (
                <Text style={styles.statusText}>
                  The {outcome.results.length} statement(s) before it ran and were saved.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[styles.status, styles.statusOk]}>
              <Text style={[styles.statusTitle, { color: colors.success }]}>
                {outcome.results.length
                  ? `✓ ${outcome.results.length} statement(s) executed in ${outcome.durationMs} ms`
                  : 'Nothing to run (only comments or whitespace).'}
              </Text>
            </View>
          )}
          <View style={{ gap: 12 }}>
            {outcome.results.map((r, i) => (
              <ResultBlock key={i} result={r} index={i} showIndex={outcome.results.length > 1} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle
        right={
          history?.length ? (
            <Button
              title="Clear history"
              variant="ghost"
              small
              onPress={async () => {
                await clearHistory(db);
                notifyChange();
              }}
            />
          ) : null
        }
      >
        History
      </SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {!history?.length ? <EmptyState text="Queries you run will appear here. Tap one to load it." /> : null}
        {history?.map((h) => (
          <Pressable key={h.id} onPress={() => onChangeSql(h.sql)} style={({ pressed }) => [styles.historyRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.dot, { backgroundColor: h.status === 'success' ? colors.success : colors.danger }]} />
            <Text style={styles.historySql} numberOfLines={2}>
              {h.sql}
            </Text>
            <Text style={styles.historyTime}>{dateTime(h.executed_at)}</Text>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

function ResultBlock({ result, index, showIndex }: { result: StatementResult; index: number; showIndex: boolean }) {
  let summary = 'Statement executed successfully';
  if (result.columns.length) summary = `${result.rows.length} row(s) returned`;
  else if (result.rowsAffected !== undefined) {
    summary = `${result.rowsAffected} row(s) affected`;
    if (result.lastInsertRowId) summary += ` · last insert id ${result.lastInsertRowId}`;
  }
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.resultHeader}>
        {showIndex ? <Text style={styles.resultIndex}>{index + 1}.</Text> : null}
        <Badge label={result.command || 'SQL'} tone="info" />
        <Text style={styles.resultSummary}>{summary}</Text>
      </View>
      {result.columns.length ? <DataTable columns={result.columns} rows={result.rows} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    minHeight: 150,
    maxHeight: 320,
    padding: 14,
    fontFamily: monoFont,
    fontSize: 14,
    lineHeight: 20,
    color: colors.codeText,
    backgroundColor: colors.codeBg,
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: colors.surface },
  toolbarHint: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  status: { borderRadius: radius, padding: 12, marginBottom: 12, gap: 4 },
  statusOk: { backgroundColor: colors.successSoft },
  statusError: { backgroundColor: colors.dangerSoft },
  statusTitle: { fontWeight: '700' },
  statusText: { color: colors.text, fontSize: 13 },
  failedSql: { fontFamily: monoFont, fontSize: 12, color: colors.text, backgroundColor: 'rgba(255,255,255,0.6)', padding: 8, borderRadius: 6 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultIndex: { fontWeight: '700', color: colors.muted },
  resultSummary: { fontSize: 13, color: colors.muted },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  historySql: { flex: 1, fontFamily: monoFont, fontSize: 12, color: colors.text },
  historyTime: { fontSize: 11, color: colors.muted },
});
