import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { confirmAction, useToast } from '../../components/feedback';
import { Enter } from '../../components/motion';
import { Badge, Button, Card, Icon, KeyValue, LoadingState, SectionTitle } from '../../components/ui';
import { useDataChange, useDbQuery } from '../../db/DataContext';
import { friendlyError, integrityIssueText } from '../../db/errors';
import { MIGRATIONS, resetDatabase, SCHEMA_VERSION } from '../../db/migrations';
import { DATABASE_NAME } from '../../db/schema';
import { checkDatabase, compactDatabase, databaseInfo, optimizeDatabase, type HealthReport } from '../../db/sqlRunner';
import { serialized } from '../../db/transaction';
import { formatBytes, formatNumber } from '../../format';
import { tryT, useI18n } from '../../i18n';
import { makeStyles, monoFont, radius, useTheme } from '../../theme';

/** Facts about the SQLite file, the migration history, a health check and maintenance actions. */
export function DatabaseOverview() {
  const { t } = useI18n();
  const styles = useStyles();
  const { data: info } = useDbQuery(databaseInfo);

  return (
    <View>
      <SectionTitle>{t('dbinfo.title')}</SectionTitle>
      {!info ? <LoadingState rows={2} /> : null}
      {info ? (
        <Enter>
          <Card>
            <KeyValue label={t('about.file')} value={DATABASE_NAME} />
            <KeyValue label={t('dbinfo.engine')} value={`SQLite ${info.sqliteVersion}`} />
            <KeyValue
              label={t('dbinfo.schema')}
              value={info.schemaVersion === SCHEMA_VERSION ? t('dbinfo.schemaCurrent', { version: info.schemaVersion }) : t('dbinfo.schemaBehind', { version: info.schemaVersion, expected: SCHEMA_VERSION })}
            />
            <KeyValue label={t('dbinfo.journal')} value={info.journalMode} />
            <KeyValue label={t('dbinfo.size')} value={t('dbinfo.sizeValue', { size: formatBytes(info.pageSize * info.pageCount), free: formatNumber(info.freePages) })} />
            <KeyValue label={t('dbinfo.foreignKeys')} value={info.foreignKeys ? t('dbinfo.enforced') : t('dbinfo.notEnforced')} />
            <KeyValue
              label={t('dbinfo.objects')}
              value={t('dbinfo.objectsValue', { tables: info.objects.table, views: info.objects.view, indexes: info.objects.index, triggers: info.objects.trigger })}
            />
            {info.journalMode === 'WAL' ? <Text style={styles.hint}>{t('dbinfo.walHint')}</Text> : null}
          </Card>
        </Enter>
      ) : null}

      <SectionTitle>{t('dbinfo.migrations')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {MIGRATIONS.map((m, i) => {
          const applied = (info?.schemaVersion ?? 0) >= m.version;
          return (
            <Enter key={m.version} index={i} style={[styles.row, i === MIGRATIONS.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.version}>v{m.version}</Text>
              <Text style={styles.rowText}>{tryT(`migration.${m.version}`) ?? m.name}</Text>
              {info ? <Badge label={applied ? t('dbinfo.applied') : t('dbinfo.pending')} tone={applied ? 'success' : 'warning'} /> : null}
            </Enter>
          );
        })}
      </Card>
      <Text style={styles.hint}>{t('dbinfo.migrationsHint')}</Text>

      <HealthCheck />
      <Maintenance />
    </View>
  );
}

function HealthCheck() {
  const { t, tn } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const db = useSQLiteContext();
  const toast = useToast();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setReport(await serialized(() => checkDatabase(db)));
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const line = (ok: boolean, text: string, key: string) => (
    <View key={key} style={styles.check}>
      <Icon name={ok ? 'checkmark-circle' : 'warning'} size={18} color={ok ? colors.success : colors.danger} />
      <Text style={[styles.checkText, { color: ok ? colors.text : colors.danger }]}>{text}</Text>
    </View>
  );

  const structureOk = report?.structure.length === 1 && report.structure[0] === 'ok';
  return (
    <>
      <SectionTitle right={<Button title={t('dbinfo.runCheck')} icon="pulse-outline" variant="secondary" small onPress={run} loading={busy} />}>{t('dbinfo.health')}</SectionTitle>
      <Card>
        <Text style={[styles.hint, { marginTop: 0 }]}>{t('dbinfo.healthHint')}</Text>
        {report ? (
          <Enter key={JSON.stringify(report)} style={{ marginTop: 8, gap: 6 }}>
            {structureOk ? line(true, t('dbinfo.structureOk'), 's') : report.structure.map((p, i) => line(false, t('dbinfo.structureBad', { problem: p }), `s${i}`))}
            {line(report.foreignKeyViolations === 0, report.foreignKeyViolations === 0 ? t('dbinfo.fkOk') : tn('dbinfo.fkBad', report.foreignKeyViolations), 'fk')}
            {report.issues.length === 0
              ? line(true, t('dbinfo.rulesOk'), 'rules')
              : report.issues.map((issue, i) => line(false, `${integrityIssueText(issue.issue)} (${issue.ref})`, `r${i}`))}
          </Enter>
        ) : null}
      </Card>
    </>
  );
}

function Maintenance() {
  const { t } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const toast = useToast();
  const [busy, setBusy] = useState<'optimize' | 'compact' | 'reset' | null>(null);

  const act = async (kind: NonNullable<typeof busy>, work: () => Promise<string>) => {
    setBusy(kind);
    try {
      toast(await work());
      notifyChange();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const optimize = () =>
    act('optimize', async () => {
      await serialized(() => optimizeDatabase(db));
      return t('dbinfo.optimized');
    });

  const compact = () =>
    act('compact', async () => {
      const { before, after } = await serialized(() => compactDatabase(db));
      return t('dbinfo.compacted', { before: formatBytes(before), after: formatBytes(after) });
    });

  const reset = async () => {
    if (!(await confirmAction(t('sql.resetTitle'), t('sql.resetBody'), t('sql.reset')))) return;
    await act('reset', async () => {
      await resetDatabase(db);
      return t('sql.resetDone');
    });
  };

  const action = (title: string, hint: string, button: ReactNode, last = false) => (
    <View style={[styles.action, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
      {button}
    </View>
  );

  return (
    <>
      <SectionTitle>{t('sql.maintenance')}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {action(t('dbinfo.optimize'), t('dbinfo.optimizeHint'), <Button title={t('dbinfo.optimize')} variant="secondary" small onPress={optimize} loading={busy === 'optimize'} disabled={busy !== null && busy !== 'optimize'} />)}
        {action(t('dbinfo.compact'), t('dbinfo.compactHint'), <Button title={t('dbinfo.compact')} variant="secondary" small onPress={compact} loading={busy === 'compact'} disabled={busy !== null && busy !== 'compact'} />)}
        {action(t('sql.resetHeading'), t('sql.resetHint'), <Button title={t('sql.reset')} variant="danger" small onPress={reset} loading={busy === 'reset'} disabled={busy !== null && busy !== 'reset'} />, true)}
      </Card>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  hint: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  version: { fontFamily: monoFont, fontWeight: '700', color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius, overflow: 'hidden', fontSize: 12 },
  rowText: { flex: 1, color: colors.text, fontSize: 14 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkText: { flex: 1, fontSize: 13, fontWeight: '500' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  actionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  actionHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
}));
