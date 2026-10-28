import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { confirmAction, useToast } from '../../components/feedback';
import { useAction } from '../../components/hooks';
import { LanguageSwitch, ThemeSwitch } from '../../components/PreferenceControls';
import { Button, Card, ErrorBanner, Field, Icon, KeyValue, SectionTitle } from '../../components/ui';
import { useDataChange, useDbQuery } from '../../db/DataContext';
import { friendlyError } from '../../db/errors';
import { databaseCounts, integrityIssues } from '../../db/repository';
import { BUSINESS_TABLES, DATABASE_NAME, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../../db/schema';
import { dateTime } from '../../format';
import { useI18n, type TranslationKey } from '../../i18n';
import { backupInfo, backupSupported, createBackup, restoreBackup } from '../../services/backup';
import { can } from '../../services/permissions';
import { getSettings, updateSetting } from '../../services/settings';
import { resetPassword } from '../../services/users';
import { useSession, useUser } from '../../session';
import { makeStyles, useTheme } from '../../theme';

const SETTING_LABELS: Record<keyof typeof DEFAULT_SETTINGS, [label: TranslationKey, numeric: boolean]> = {
  pharmacy_name: ['settings.pharmacyName', false],
  expiry_warning_days: ['settings.expiryWarning', true],
  default_min_stock: ['settings.defaultMinStock', true],
  auto_lock_minutes: ['settings.autoLock', true],
  receipt_footer: ['settings.receiptFooter', false],
};

// The integrity view (v_integrity_issues) stores English text; map each known message for display.
const INTEGRITY_ISSUES: Record<string, TranslationKey> = {
  'Batch balance differs from movement ledger': 'integrity.batchBalance',
  'Completed order without items': 'integrity.orderNoItems',
  'Order subtotal differs from its lines': 'integrity.subtotal',
  'Sold quantity differs from batch allocations': 'integrity.soldQty',
  'Returned quantity differs from RETURN movements': 'integrity.returnedQty',
  'Prescription medicine sold without prescription': 'integrity.rx',
};

export function SettingsScreen() {
  const user = useUser();
  return (
    <View>
      <Preferences />
      {can(user, 'settings.manage') ? <AppSettings /> : null}
      {can(user, 'backup.manage') ? <Backup /> : null}
      <ChangePassword />
      <About />
    </View>
  );
}

function Preferences() {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <>
      <SectionTitle>{t('settings.preferences')}</SectionTitle>
      <Card>
        <View style={styles.prefRow}>
          <Text style={styles.prefLabel}>{t('language.label')}</Text>
          <LanguageSwitch variant="full" />
        </View>
        <View style={styles.prefRow}>
          <Text style={styles.prefLabel}>{t('theme.label')}</Text>
          <ThemeSwitch />
        </View>
        <Text style={styles.muted}>{t('settings.preferencesHint')}</Text>
      </Card>
    </>
  );
}

function AppSettings() {
  const { data } = useDbQuery(async (db) => {
    const settings = (await getSettings(db)) as unknown as Record<string, unknown>;
    return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, String(settings[k] ?? '')]));
  });
  // Remounts with fresh field values whenever the stored settings change.
  return data ? <SettingsForm key={JSON.stringify(data)} saved={data} /> : null;
}

function SettingsForm({ saved }: { saved: Record<string, string> }) {
  const { t } = useI18n();
  const db = useSQLiteContext();
  const user = useUser();
  const [values, setValues] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const { notifyChange } = useDataChange();
  const toast = useToast();

  const save = async () => {
    setError(null);
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
      if (values[key] === saved[key]) continue;
      try {
        await updateSetting(db, user, key, values[key]);
      } catch (e) {
        setError(`${t(SETTING_LABELS[key][0])}: ${friendlyError(e)}`);
        return;
      }
    }
    notifyChange();
    toast(t('settings.saved'));
  };

  return (
    <>
      <SectionTitle>{t('settings.title')}</SectionTitle>
      <Card>
        {error ? <ErrorBanner message={error} /> : null}
        {(Object.keys(SETTING_LABELS) as (keyof typeof DEFAULT_SETTINGS)[]).map((key) => (
          <Field
            key={key}
            label={t(SETTING_LABELS[key][0])}
            value={values[key] ?? ''}
            onChangeText={(v) => setValues((s) => ({ ...s, [key]: v }))}
            keyboardType={SETTING_LABELS[key][1] ? 'number-pad' : 'default'}
          />
        ))}
        <Button title={t('settings.save')} onPress={save} />
      </Card>
    </>
  );
}

function Backup() {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const { logout } = useSession();
  const { version, notifyChange } = useDataChange();
  const toast = useToast();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof backupInfo>>>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backupInfo().then(setInfo, () => setInfo(null));
  }, [version]);

  const backup = async () => {
    setBusy(true);
    try {
      await createBackup(db, user);
      notifyChange();
      toast(t('backup.created'));
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!info) return;
    if (!(await confirmAction(t('backup.restoreTitle'), t('backup.restoreBody', { when: dateTime(info.created_at) }), t('backup.restore')))) return;
    setBusy(true);
    try {
      await restoreBackup(db, user);
      notifyChange();
      toast(t('backup.restored'));
      logout();
    } catch (e) {
      toast(friendlyError(e), 'error');
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>{t('backup.title')}</SectionTitle>
      <Card>
        {backupSupported ? (
          <>
            <Text style={styles.muted}>
              {t('backup.intro')}
            </Text>
            <KeyValue label={t('backup.last')} value={info ? `${dateTime(info.created_at)} (${tn('count.orders', info.orders)})` : t('backup.noneYet')} />
            <View style={styles.buttons}>
              <Button title={t('backup.create')} icon="cloud-upload-outline" onPress={backup} loading={busy} />
              <Button title={t('backup.restore')} variant="danger" onPress={restore} disabled={!info || busy} />
            </View>
          </>
        ) : (
          <Text style={styles.muted}>{t('backup.webNote')}</Text>
        )}
      </Card>
    </>
  );
}

function ChangePassword() {
  const { t } = useI18n();
  const db = useSQLiteContext();
  const user = useUser();
  const [password, setPassword] = useState('');
  const run = useAction();
  return (
    <>
      <SectionTitle>{t('password.title')}</SectionTitle>
      <Card>
        <Field label={t('password.new')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" hint={t('validate.passwordHint')} />
        <Button
          title={t('password.change')}
          variant="secondary"
          disabled={!password}
          onPress={async () => {
            if (await run(() => resetPassword(db, user, user.user_id, password), t('password.changed'))) setPassword('');
          }}
        />
      </Card>
    </>
  );
}

function About() {
  const { t, tn } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const { data } = useDbQuery(async (db) => ({ counts: await databaseCounts(db, BUSINESS_TABLES), issues: await integrityIssues(db) }));
  return (
    <>
      <SectionTitle>{t('about.title')}</SectionTitle>
      <Card>
        <KeyValue label={t('about.file')} value={DATABASE_NAME} />
        <KeyValue label={t('about.schema')} value={String(SCHEMA_VERSION)} />
        {data
          ? BUSINESS_TABLES.map((table) => <KeyValue key={table} label={table} value={tn('count.rows', data.counts[table])} />)
          : null}
        <View style={{ marginTop: 8 }}>
          {data?.issues.length === 0 ? (
            <View style={styles.statusRow}>
              <Icon name="checkmark-circle-outline" size={18} color={colors.success} />
              <Text style={[styles.statusText, { color: colors.success }]}>{t('about.integrityOk')}</Text>
            </View>
          ) : (
            data?.issues.map((i, n) => (
              <View key={n} style={styles.statusRow}>
                <Icon name="warning-outline" size={18} color={colors.danger} />
                <Text style={[styles.statusText, { color: colors.danger }]}>
                  {INTEGRITY_ISSUES[i.issue] ? t(INTEGRITY_ISSUES[i.issue]) : i.issue} ({i.ref})
                </Text>
              </View>
            ))
          )}
        </View>
      </Card>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  muted: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  prefLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  statusText: { flex: 1, fontWeight: '600', fontSize: 13 },
}));
