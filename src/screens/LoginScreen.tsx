import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorBanner, Field } from '../components/ui';
import { friendlyError } from '../db/errors';
import { DEMO_ACCOUNTS } from '../db/seed';
import { ROLE_LABELS } from '../services/permissions';
import { useSession } from '../session';
import { colors } from '../theme';

export function LoginScreen() {
  const { login } = useSession();
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
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>✚</Text>
        <Text style={styles.title}>PharmaCare</Text>
        <Text style={styles.subtitle}>Offline pharmacy manager · data stays on this device</Text>

        <Card style={{ width: '100%', marginTop: 24 }}>
          {error ? <ErrorBanner message={error} /> : null}
          <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            onSubmitEditing={() => submit()}
          />
          <View style={styles.row}>
            <Button title={showPassword ? 'Hide password' : 'Show password'} variant="ghost" small onPress={() => setShowPassword((s) => !s)} />
            <View style={{ flex: 1 }} />
            <Button title="Log in" onPress={() => submit()} loading={busy} disabled={!username || !password} />
          </View>
        </Card>

        <Card style={styles.demo}>
          <Text style={styles.demoTitle}>Demo accounts (prototype only)</Text>
          {DEMO_ACCOUNTS.map((a) => (
            <View key={a.username} style={styles.demoRow}>
              <Text style={styles.demoText}>
                {ROLE_LABELS[a.role]}: <Text style={styles.mono}>{a.username}</Text> / <Text style={styles.mono}>{a.password}</Text>
              </Text>
              <Button title="Use" small variant="secondary" onPress={() => submit(a.username, a.password)} disabled={busy} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { fontSize: 44, color: colors.primary },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  demo: { width: '100%', marginTop: 16, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  demoTitle: { fontWeight: '700', color: colors.primary, marginBottom: 6 },
  demoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
  demoText: { color: colors.text, flex: 1 },
  mono: { fontWeight: '700' },
});
