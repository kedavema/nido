import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, PressableScale, m1TextStyles } from '@/components/m1-ui';
import { useSession } from '@/auth/session-provider';
import { themeTokens } from '@/theme/tokens';

interface ChecklistItem {
  readonly key: string;
  readonly prefix: string;
  readonly bold: string;
  readonly suffix: string;
}

const CHECKLIST_ITEMS: readonly ChecklistItem[] = [
  {
    key: 'shared-household',
    prefix: 'Un solo hogar compartido: ',
    bold: 'los dos ven todo',
    suffix: ', siempre.',
  },
  {
    key: 'fast-entry',
    prefix: 'Cargá un gasto en ',
    bold: 'segundos',
    suffix: ', incluso sin señal.',
  },
  {
    key: 'guaranies',
    prefix: 'Presupuesto mensual en ',
    bold: 'guaraníes',
    suffix: ', sin vueltas.',
  },
];

function ChecklistRow({ prefix, bold, suffix }: Omit<ChecklistItem, 'key'>) {
  return (
    <View style={styles.checklistRow}>
      <View style={styles.checklistBullet}>
        <Ionicons
          color={themeTokens.semanticColors.success.foreground}
          name="checkmark"
          size={14}
        />
      </View>
      <Text style={[m1TextStyles.body, styles.checklistText]}>
        {prefix}
        <Text style={[m1TextStyles.body, styles.checklistBold]}>{bold}</Text>
        {suffix}
      </Text>
    </View>
  );
}

function GoogleSignInButton({ onPress }: { readonly onPress: () => void }) {
  return (
    // The first control anyone touches in the app, and the only one reachable on
    // web before signing in — it gets the same press response as every other CTA.
    <PressableScale
      accessibilityHint="Abre el inicio de sesión seguro de Google"
      accessibilityLabel="Continuar con Google"
      haptic
      onPress={onPress}
      style={styles.googleButton}
    >
      <View style={styles.googleMark}>
        <Ionicons color={themeTokens.colors.ink} name="logo-google" size={16} />
      </View>
      <Text style={styles.googleButtonLabel}>Continuar con Google</Text>
    </PressableScale>
  );
}

export default function SignInScreen() {
  const { signIn } = useSession();

  return (
    <AppScreen centered>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Text style={styles.logoMark}>n</Text>
        </View>
        <Text accessibilityRole="header" style={styles.heading}>
          Nido
        </Text>
        <Text style={styles.subtitle}>La plata de la casa, clara para los dos.</Text>
      </View>

      <Card>
        {CHECKLIST_ITEMS.map(({ key, ...item }) => (
          <ChecklistRow key={key} {...item} />
        ))}
      </Card>

      <GoogleSignInButton onPress={() => void signIn()} />

      <View style={styles.legal}>
        <Text style={styles.legalPrimary}>
          Cada uno entra con su propia cuenta. El hogar es de los dos.
        </Text>
        <Text style={styles.legalSecondary}>
          Al continuar aceptás los Términos y la Política de privacidad.
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    gap: themeTokens.spacing.base,
    marginBottom: themeTokens.spacing.base,
  },
  logo: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.colors.primary,
  },
  logoMark: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.displayBold,
    fontSize: 36,
    lineHeight: 40,
  },
  heading: {
    marginTop: themeTokens.spacing.cardGap,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
    lineHeight: 34,
  },
  subtitle: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 21,
    textAlign: 'center',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checklistBullet: {
    width: 22,
    height: 22,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: themeTokens.semanticColors.success.background,
  },
  checklistText: {
    flex: 1,
  },
  checklistBold: {
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  googleButton: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: themeTokens.spacing.cardPadding,
    paddingVertical: 10,
  },
  googleMark: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 21,
  },
  legal: {
    marginTop: themeTokens.spacing.base,
    alignItems: 'center',
    gap: 4,
  },
  legalPrimary: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
    textAlign: 'center',
  },
  legalSecondary: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.label,
    lineHeight: 15,
    textAlign: 'center',
  },
});
