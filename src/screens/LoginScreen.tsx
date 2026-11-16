import { useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Text } from '../components/Text';
import { PharmacyCross } from '../components/brand';
import { Enter, useShake } from '../components/motion';
import { LanguageSwitch, ThemeToggle } from '../components/PreferenceControls';
import { Button, Card, ErrorBanner, Field } from '../components/ui';
import { friendlyError } from '../db/errors';
import { DEMO_ACCOUNTS } from '../db/seed';
import { useI18n } from '../i18n';
import { roleLabel } from '../services/permissions';
import { useSession } from '../session';
import { makeStyles } from '../theme';

export function LoginScreen() {
  const { login } = useSession();
  const { t } = useI18n();
  const styles = useStyles();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useShake();

  const submit = async (u = username, p = password) => {
    setBusy(true);
    setError(null);
    try {
      await login(u, p);
    } catch (e) {
      setError(friendlyError(e));
      shake.play();
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
        <Enter index={0} offset={16} style={styles.center}>
          <View style={styles.logo}>
            <PharmacyCross size={30} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            PharmaCare
          </Text>
          <Text style={styles.subtitle}>{t('login.tagline')}</Text>
        </Enter>

        <Enter index={2} offset={16} style={styles.full}>
          <Animated.View style={shake.style}>
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
          </Animated.View>
        </Enter>

        <Enter index={4} offset={16} style={styles.full}>
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
        </Enter>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  wrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  center: { alignItems: 'center' },
  full: { width: '100%' },
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '600', letterSpacing: -0.6, color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  demo: { width: '100%', marginTop: 16, backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.borderStrong },
  demoTitle: { fontWeight: '600', fontSize: 14, color: colors.text, marginBottom: 6 },
  demoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
  demoText: { color: colors.text, flex: 1 },
  mono: { fontWeight: '700' },
}));
