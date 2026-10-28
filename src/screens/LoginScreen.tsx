import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { LanguageSwitch, ThemeToggle } from '../components/PreferenceControls';
import { Button, Card, ErrorBanner, Field, Icon } from '../components/ui';
import { friendlyError } from '../db/errors';
import { DEMO_ACCOUNTS } from '../db/seed';
import { useI18n } from '../i18n';
import { roleLabel } from '../services/permissions';
import { useSession } from '../session';
import { makeStyles, useTheme } from '../theme';

export function LoginScreen() {
  const { login } = useSession();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (u = username, p = password) => {
    setBusy(true);
    setError(null);
    try {
      await login(u, p);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <LanguageSwitch />
        <ThemeToggle />
      </View>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Icon name="medkit" size={32} color={colors.onPrimary} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          PharmaCare
        </Text>
        <Text style={styles.subtitle}>{t('login.tagline')}</Text>

        <Card style={{ width: '100%', marginTop: 24 }}>
          {error ? <ErrorBanner message={error} /> : null}
          <Field label={t('login.username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
          <Field
            label={t('login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            onSubmitEditing={() => submit()}
          />
          <View style={styles.row}>
            <Button
              title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              variant="ghost"
              small
              icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setShowPassword((s) => !s)}
            />
            <View style={{ flex: 1 }} />
            <Button title={t('login.submit')} onPress={() => submit()} loading={busy} disabled={!username || !password} />
          </View>
        </Card>

        <Card style={styles.demo}>
          <Text style={styles.demoTitle}>{t('login.demoTitle')}</Text>
          {DEMO_ACCOUNTS.map((a) => (
            <View key={a.username} style={styles.demoRow}>
              <Text style={styles.demoText}>
                {roleLabel(a.role)}: <Text style={styles.mono}>{a.username}</Text> / <Text style={styles.mono}>{a.password}</Text>
              </Text>
              <Button title={t('login.useAccount')} small variant="secondary" onPress={() => submit(a.username, a.password)} disabled={busy} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  wrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  demo: { width: '100%', marginTop: 16, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  demoTitle: { fontWeight: '700', color: colors.primary, marginBottom: 6 },
  demoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
  demoText: { color: colors.text, flex: 1 },
  mono: { fontWeight: '700' },
}));
