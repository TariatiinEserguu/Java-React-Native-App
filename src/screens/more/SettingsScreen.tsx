import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { confirmAction, useToast } from '../../components/feedback';
import { useAction } from '../../components/hooks';
import { Button, Card, ErrorBanner, Field, KeyValue, SectionTitle } from '../../components/ui';
import { useDataChange, useDbQuery } from '../../db/DataContext';
import { friendlyError } from '../../db/errors';
import { databaseCounts, integrityIssues } from '../../db/repository';
import { BUSINESS_TABLES, DATABASE_NAME, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../../db/schema';
import { dateTime } from '../../format';
import { backupInfo, backupSupported, createBackup, restoreBackup } from '../../services/backup';
import { can } from '../../services/permissions';
import { getSettings, updateSetting } from '../../services/settings';
import { resetPassword } from '../../services/users';
import { useSession, useUser } from '../../session';
import { colors } from '../../theme';

const SETTING_LABELS: Record<keyof typeof DEFAULT_SETTINGS, [label: string, numeric: boolean]> = {
  pharmacy_name: ['Pharmacy name (on receipts)', false],
  expiry_warning_days: ['Near-expiry warning (days)', true],
  default_min_stock: ['Default minimum stock for new medicines', true],
  auto_lock_minutes: ['Auto-lock after inactivity (minutes)', true],
  receipt_footer: ['Receipt footer', false],
};

export function SettingsScreen() {
  const user = useUser();
  return (
    <View>
      {can(user, 'settings.manage') ? <AppSettings /> : null}
      {can(user, 'backup.manage') ? <Backup /> : null}
      <ChangePassword />
      <About />
    </View>
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
        setError(`${SETTING_LABELS[key][0]}: ${friendlyError(e)}`);
        return;
      }
    }
    notifyChange();
    toast('Settings saved');
  };

  return (
    <>
      <SectionTitle>Settings</SectionTitle>
      <Card>
        {error ? <ErrorBanner message={error} /> : null}
        {(Object.keys(SETTING_LABELS) as (keyof typeof DEFAULT_SETTINGS)[]).map((key) => (
          <Field
            key={key}
            label={SETTING_LABELS[key][0]}
            value={values[key] ?? ''}
            onChangeText={(v) => setValues((s) => ({ ...s, [key]: v }))}
            keyboardType={SETTING_LABELS[key][1] ? 'number-pad' : 'default'}
          />
        ))}
        <Button title="Save settings" onPress={save} />
      </Card>
    </>
  );
}

function Backup() {
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
      toast('Backup created');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!info) return;
    if (!(await confirmAction('Restore backup?', `All current data will be replaced by the backup from ${dateTime(info.created_at)}. You will be logged out.`, 'Restore'))) return;
    setBusy(true);
    try {
      await restoreBackup(db, user);
      notifyChange();
      toast('Backup restored. Please log in again.');
      logout();
    } catch (e) {
      toast(friendlyError(e), 'error');
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>Backup & restore</SectionTitle>
      <Card>
        {backupSupported ? (
          <>
            <Text style={styles.muted}>
              Copies the whole database to a backup file in the app’s private storage, using SQLite’s backup API.
            </Text>
            <KeyValue label="Last backup" value={info ? `${dateTime(info.created_at)} (${info.orders} orders)` : 'None yet'} />
            <View style={styles.buttons}>
              <Button title="Create backup" onPress={backup} loading={busy} />
              <Button title="Restore backup" variant="danger" onPress={restore} disabled={!info || busy} />
            </View>
          </>
        ) : (
          <Text style={styles.muted}>Backups are available in the Android and iOS app. On web the data lives in the browser’s storage.</Text>
        )}
      </Card>
    </>
  );
}

function ChangePassword() {
  const db = useSQLiteContext();
  const user = useUser();
  const [password, setPassword] = useState('');
  const run = useAction();
  return (
    <>
      <SectionTitle>My password</SectionTitle>
      <Card>
        <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" hint="At least 8 characters with a letter and a number." />
        <Button
          title="Change password"
          variant="secondary"
          disabled={!password}
          onPress={async () => {
            if (await run(() => resetPassword(db, user, user.user_id, password), 'Password changed')) setPassword('');
          }}
        />
      </Card>
    </>
  );
}

function About() {
  const { data } = useDbQuery(async (db) => ({ counts: await databaseCounts(db, BUSINESS_TABLES), issues: await integrityIssues(db) }));
  return (
    <>
      <SectionTitle>About this database</SectionTitle>
      <Card>
        <KeyValue label="File" value={DATABASE_NAME} />
        <KeyValue label="Schema version" value={String(SCHEMA_VERSION)} />
        {data
          ? BUSINESS_TABLES.map((t) => <KeyValue key={t} label={t} value={`${data.counts[t]} rows`} />)
          : null}
        <View style={{ marginTop: 8 }}>
          {data?.issues.length === 0 ? (
            <Text style={{ color: colors.success, fontWeight: '600' }}>✓ Integrity check passed: stock ledger, order totals and prescriptions are consistent.</Text>
          ) : (
            data?.issues.map((i, n) => (
              <Text key={n} style={{ color: colors.danger }}>
                ⚠ {i.issue} ({i.ref})
              </Text>
            ))
          )}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
});
