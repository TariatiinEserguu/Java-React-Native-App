import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DataTable } from '../../components/DataTable';
import { SelectField } from '../../components/SelectField';
import { Chip, EmptyState, ErrorBanner, LoadingState } from '../../components/ui';
import { useDbQuery } from '../../db/DataContext';
import { REPORTS } from '../../db/reports';
import { shortDate, todayIso } from '../../format';
import { useI18n, tryT, type TranslationKey } from '../../i18n';
import { can } from '../../services/permissions';
import { useUser } from '../../session';
import { makeStyles } from '../../theme';

const RANGES: [TranslationKey, number][] = [
  ['period.today', 0],
  ['period.7d', 6],
  ['period.30d', 29],
  ['period.90d', 89],
  ['period.1y', 364],
];

/** Report columns are SQL aliases; enum-like cells (state, type, payment) are translated for display. */
const ENUM_PREFIX: Record<string, string> = { state: 'batch', type: 'movement', payment: 'payment' };

export function ReportsScreen() {
  const user = useUser();
  const { t, language } = useI18n();
  const styles = useStyles();
  const reports = REPORTS.filter((r) => can(user, r.permission));
  const [selected, setSelected] = useState(reports[0]?.id);
  const [days, setDays] = useState(29);
  const report = reports.find((r) => r.id === selected);
  const range = { from: todayIso(-days), to: todayIso() };
  // `language` is a dependency so the summary line (built inside the report) is rebuilt on a language switch.
  const { data, error } = useDbQuery((db) => (report ? report.run(db, range) : Promise.resolve(null)), [selected, days, language]);

  const columnLabel = (column: string) => tryT(`reportCol.${column}`) ?? column;
  const cell = (column: string, value: unknown) => {
    const prefix = ENUM_PREFIX[column];
    return prefix && typeof value === 'string' ? (tryT(`${prefix}.${value}`) ?? value) : value;
  };

  return (
    <View>
      {report ? (
        <>
          <SelectField
            label={t('reports.report')}
            value={report.id}
            onChange={setSelected}
            options={reports.map((r) => ({ value: r.id, label: t(`report.${r.id}.title` as TranslationKey), detail: t(`report.${r.id}.desc` as TranslationKey) }))}
          />
          <Text style={[styles.muted, { marginBottom: 8 }]}>{t(`report.${report.id}.desc` as TranslationKey)}</Text>
          {report.usesRange ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {RANGES.map(([label, d]) => (
                <Chip key={label} label={t(label)} active={days === d} onPress={() => setDays(d)} />
              ))}
            </ScrollView>
          ) : null}
          {report.usesRange ? (
            <Text style={styles.muted}>{t('reports.range', { from: shortDate(range.from), to: shortDate(range.to) })}</Text>
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}
          {!data && !error ? <LoadingState /> : null}
          {data?.summary ? <Text style={styles.summary}>{data.summary}</Text> : null}
          {data ? (
            data.rows.length ? (
              <DataTable
                columns={data.columns.map(columnLabel)}
                rows={data.rows.map((row) => row.map((value, c) => cell(data.columns[c], value)))}
              />
            ) : (
              <EmptyState icon="bar-chart-outline" text={t('reports.empty')} />
            )
          ) : null}
        </>
      ) : (
        <EmptyState icon="lock-closed-outline" text={t('reports.noAccess')} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  muted: { fontSize: 13, color: colors.muted },
  chips: { gap: 8, paddingBottom: 8 },
  summary: { fontSize: 15, fontWeight: '700', color: colors.primary, marginVertical: 8 },
}));
