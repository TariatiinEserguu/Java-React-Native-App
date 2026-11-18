import { useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { PharmacyCross } from '../components/brand';
import { Enter, useShake } from '../components/motion';
import { LanguageSwitch, ThemeToggle } from '../components/PreferenceControls';
import { Text } from '../components/Text';
import { Button, ErrorBanner, Field, focusRing, Icon, IconButton, LoadingState, PressableScale } from '../components/ui';
import { friendlyError } from '../db/errors';
import { demoMode } from '../db/open';
import { DEMO_ACCOUNTS } from '../db/seed';
import { useI18n } from '../i18n';
import { roleLabel } from '../services/permissions';
import { useSession } from '../session';
import { makeStyles, useTheme } from '../theme';

const SPLIT_BREAKPOINT = 960;
const ILLUSTRATION_CELLS = [0, 1, 2, 3, 4, 5];

export function LoginScreen() {
  const { createAdministrator, login, needsSetup, retrySetupCheck, setupError } = useSession();
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_BREAKPOINT;
  const compact = width < 360;
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSampleAccounts, setShowSampleAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const shake = useShake();
  const canSubmit = Boolean(username.trim() && password && (!needsSetup || fullName.trim()));

  const submit = async (name = username, secret = password) => {
    if (submitting.current || needsSetup === null || !name.trim() || !secret || (needsSetup && !fullName.trim())) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (needsSetup) await createAdministrator({ full_name: fullName, username: name, password: secret });
      else await login(name, secret);
    } catch (e) {
      setError(friendlyError(e));
      shake.play();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={[styles.topBar, split && styles.topBarWide, compact && styles.topBarCompact]}>
        <View style={styles.brand}>
          <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
            <PharmacyCross size={18} color={colors.onPrimary} />
          </View>
          <Text style={[styles.brandName, compact && styles.brandNameCompact]}>PharmaCare</Text>
        </View>
        <View style={styles.preferences}>
          <LanguageSwitch />
          <ThemeToggle />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.layout, split && styles.layoutWide]} keyboardShouldPersistTaps="handled">
        {split ? (
          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{t('login.tagline')}</Text>
              <Text style={styles.heroDescription}>{t('login.overview')}</Text>
            </View>
            <PharmacyIllustration />
          </View>
        ) : null}

        <View style={[styles.formPane, compact && styles.formPaneCompact]}>
          <Enter style={styles.form} offset={10}>
            {setupError ? (
              <View style={styles.fields}>
                <ErrorBanner message={setupError} />
                <Button title={t('login.retry')} onPress={retrySetupCheck} style={styles.submit} />
              </View>
            ) : needsSetup === null ? (
              <LoadingState rows={2} />
            ) : (
              <>
                <View style={styles.formHeading}>
                  <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>{t(needsSetup ? 'login.setupTitle' : 'login.title')}</Text>
                  <Text style={styles.subtitle}>{t(needsSetup ? 'login.setupDescription' : 'login.description')}</Text>
                </View>
                <Animated.View style={[styles.fields, shake.style]}>
                  {error ? <ErrorBanner message={error} /> : null}
                  {needsSetup ? (
                    <Field
                      label={t('field.fullName')}
                      value={fullName}
                      onChangeText={setFullName}
                      autoCapitalize="words"
                      autoComplete="name"
                      style={styles.input}
                    />
                  ) : null}
                  <Field
                    label={t('login.username')}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    style={styles.input}
                  />
                  <Field
                    label={t('login.password')}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    returnKeyType="go"
                    onSubmitEditing={() => submit()}
                    hint={needsSetup ? t('validate.passwordHint') : undefined}
                    style={styles.input}
                    trailing={(
                      <IconButton
                        icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                        onPress={() => setShowPassword((shown) => !shown)}
                      />
                    )}
                  />
                  <Button title={t(needsSetup ? 'login.createAdministrator' : 'login.submit')} onPress={() => submit()} loading={busy} disabled={!canSubmit} style={styles.submit} />
                </Animated.View>
              </>
            )}

            <View style={styles.support}>
              <View style={styles.privacy}>
                <Icon name="lock-closed-outline" size={16} color={colors.primary} />
                <Text style={styles.privacyText}>{t('login.localData')}</Text>
              </View>
              {demoMode && needsSetup === false ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showSampleAccounts }}
                  onPress={() => setShowSampleAccounts((shown) => !shown)}
                  pressScale={1}
                  style={(state) => [styles.sampleToggle, focusRing(colors, state)]}
                >
                  <Text style={styles.sampleText}>{t('login.demoTitle')}</Text>
                  <Icon name={showSampleAccounts ? 'chevron-up' : 'chevron-down'} size={14} />
                </PressableScale>
              ) : null}
              {demoMode && needsSetup === false && showSampleAccounts ? (
                <View style={styles.sampleList}>
                  {DEMO_ACCOUNTS.map((account) => (
                    <PressableScale
                      key={account.username}
                      accessibilityRole="button"
                      accessibilityLabel={roleLabel(account.role)}
                      accessibilityState={{ disabled: busy }}
                      onPress={() => submit(account.username, account.password)}
                      disabled={busy}
                      pressScale={0.99}
                      style={(state) => [styles.sampleAccount, state.hovered && styles.sampleAccountHover, focusRing(colors, state)]}
                    >
                      <View style={styles.sampleIdentity}>
                        <Text style={styles.sampleRole}>{roleLabel(account.role)}</Text>
                        <Text style={styles.sampleName}>{account.username}</Text>
                      </View>
                      <Icon name="arrow-forward" size={16} color={colors.primary} />
                    </PressableScale>
                  ))}
                </View>
              ) : null}
            </View>
          </Enter>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A decorative prescription sheet and blister pack built from native views. */
function PharmacyIllustration() {
  const styles = useStyles();
  return (
    <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <View style={styles.orbitOuter} />
      <View style={styles.orbitInner} />
      <View style={styles.orbitPoint} />
      <View style={styles.prescription}>
        <View style={styles.prescriptionMark}><PharmacyCross size={22} color="#C9F4DF" /></View>
        <View style={styles.prescriptionLine} />
        <View style={[styles.prescriptionLine, styles.prescriptionLineShort]} />
        <View style={styles.prescriptionRule} />
        <View style={styles.prescriptionLine} />
        <View style={[styles.prescriptionLine, styles.prescriptionLineShort]} />
      </View>
      <View style={styles.blister}>
        {ILLUSTRATION_CELLS.map((cell) => (
          <View key={cell} style={styles.blisterCell}>
            <View style={styles.pill} />
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, gap: 10 },
  topBarWide: { paddingHorizontal: 36, paddingVertical: 16 },
  topBarCompact: { paddingHorizontal: 14, gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  brandMark: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  brandMarkCompact: { width: 32, height: 32 },
  brandName: { fontWeight: '700', color: colors.text, fontSize: 19, letterSpacing: -0.55, flexShrink: 1 },
  brandNameCompact: { fontSize: 17 },
  preferences: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  layout: { flexGrow: 1 },
  layoutWide: { flexDirection: 'row', padding: 24, gap: 24, minHeight: 650 },
  hero: { flex: 1, minWidth: 0, borderRadius: 24, backgroundColor: '#0C3834', padding: 40, justifyContent: 'center', overflow: 'hidden' },
  heroCopy: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 13 },
  heroTitle: { color: '#F4FCF8', fontSize: 42, lineHeight: 47, letterSpacing: -1.4, fontWeight: '700' },
  heroDescription: { color: '#C0DBD2', fontSize: 17, lineHeight: 25, maxWidth: 340 },
  formPane: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  formPaneCompact: { paddingVertical: 24, paddingHorizontal: 20 },
  form: { width: '100%', maxWidth: 420 },
  formHeading: { marginBottom: 28, gap: 7 },
  title: { fontSize: 38, lineHeight: 43, letterSpacing: -1.35, fontWeight: '700', color: colors.text },
  titleCompact: { fontSize: 32, lineHeight: 37, letterSpacing: -0.9 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  fields: { gap: 5 },
  input: { minHeight: 50 },
  submit: { minHeight: 50, marginTop: 4 },
  support: { marginTop: 26, gap: 8 },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  privacyText: { color: colors.muted, fontSize: 13, lineHeight: 19, flexShrink: 1 },
  sampleToggle: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 3, borderRadius: 6 },
  sampleText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  sampleList: { gap: 6 },
  sampleAccount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 48, gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 9 },
  sampleAccountHover: { backgroundColor: colors.surfaceAlt },
  sampleIdentity: { flex: 1, minWidth: 0 },
  sampleRole: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sampleName: { color: colors.muted, fontSize: 12 },
  illustration: { width: 304, height: 288, alignSelf: 'center', marginTop: 28 },
  orbitOuter: { position: 'absolute', left: 10, top: 0, width: 284, height: 284, borderWidth: 1, borderRadius: 142, borderColor: '#28635A' },
  orbitInner: { position: 'absolute', left: 37, top: 27, width: 230, height: 230, borderWidth: 1, borderRadius: 115, borderColor: '#28635A', backgroundColor: '#124640' },
  orbitPoint: { position: 'absolute', top: 37, right: 49, width: 10, height: 10, borderRadius: 5, backgroundColor: '#82CCB2' },
  prescription: { position: 'absolute', left: 64, top: 43, width: 136, height: 176, gap: 10, padding: 15, borderWidth: 1, borderColor: '#599083', borderRadius: 16, backgroundColor: '#205D53', transform: [{ rotate: '-15deg' }] },
  prescriptionMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#397F6E', alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  prescriptionLine: { height: 3, borderRadius: 2, width: '88%', backgroundColor: '#69A797' },
  prescriptionLineShort: { width: '53%' },
  prescriptionRule: { width: '100%', height: 1, backgroundColor: '#407C70', marginVertical: 3 },
  blister: { position: 'absolute', left: 146, top: 88, width: 122, height: 156, padding: 10, gap: 6, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', backgroundColor: '#9BDDCA', borderColor: '#CCF1E3', borderWidth: 2, borderRadius: 18, transform: [{ rotate: '15deg' }] },
  blisterCell: { width: 42, height: 39, borderRadius: 11, backgroundColor: '#81C9B5', borderWidth: 1, borderColor: '#B4E6D9', alignItems: 'center', justifyContent: 'center' },
  pill: { width: 23, height: 11, borderRadius: 6, backgroundColor: '#E0F8EC', borderBottomWidth: 2, borderColor: '#BDDFD1', transform: [{ rotate: '-12deg' }] },
}));
