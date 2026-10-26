import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DataTable } from '../../components/DataTable';
import { SelectField } from '../../components/SelectField';
import { Chip, ErrorBanner } from '../../components/ui';
import { useDbQuery } from '../../db/DataContext';
import { REPORTS } from '../../db/reports';
import { todayIso } from '../../format';
import { can } from '../../services/permissions';
import { useUser } from '../../session';
import { colors } from '../../theme';

const RANGES: [string, number][] = [
  ['Today', 0],
  ['7 days', 6],
  ['30 days', 29],
  ['90 days', 89],
  ['1 year', 364],
];

export function ReportsScreen() {
  const user = useUser();
  const reports = REPORTS.filter((r) => can(user, r.permission));
  const [selected, setSelected] = useState(reports[0]?.id);
  const [days, setDays] = useState(29);
  const report = reports.find((r) => r.id === selected);
  const range = { from: todayIso(-days), to: todayIso() };
  const { data, error } = useDbQuery((db) => (report ? report.run(db, range) : Promise.resolve(null)), [selected, days]);

  return (
    <View>
      {report ? (
        <>
          <SelectField
            label="Report"
            value={report.id}
            onChange={setSelected}
            options={reports.map((r) => ({ value: r.id, label: r.title, detail: r.description }))}
          />
          <Text style={[styles.muted, { marginBottom: 8 }]}>{report.description}</Text>
          {report.usesRange ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {RANGES.map(([label, d]) => (
                <Chip key={label} label={label} active={days === d} onPress={() => setDays(d)} />
              ))}
            </ScrollView>
          ) : null}
          {report.usesRange ? (
            <Text style={styles.muted}>
              {range.from} to {range.to}
            </Text>
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}
          {data?.summary ? <Text style={styles.summary}>{data.summary}</Text> : null}
          {data ? (
            data.rows.length ? (
              <DataTable columns={data.columns} rows={data.rows} />
            ) : (
              <Text style={[styles.muted, { paddingVertical: 12 }]}>No data for this period.</Text>
            )
          ) : null}
        </>
      ) : (
        <Text style={styles.muted}>Your role has no reports.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, color: colors.muted },
  chips: { gap: 8, paddingBottom: 8 },
  summary: { fontSize: 15, fontWeight: '700', color: colors.primary, marginVertical: 8 },
});
