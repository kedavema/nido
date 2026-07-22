import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  ActionButton,
  AppScreen,
  Card,
  FormField,
  PageHeader,
  m1TextStyles,
} from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';

function firstNameFrom(displayName: string | null): string | null {
  const trimmed = displayName?.trim() ?? '';

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.split(/\s+/)[0] ?? null;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { createHousehold, signOut, state } = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const firstName =
    state.kind === 'authenticated' ? firstNameFrom(state.identity.displayName) : null;
  const subtitle =
    firstName === null
      ? 'Hola · después invitás a tu pareja'
      : `Hola, ${firstName} · después invitás a tu pareja`;

  async function submit(): Promise<void> {
    if (name.trim().length === 0) {
      setError('Escribí un nombre para tu hogar.');
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      await createHousehold(name);
    } catch (actionError) {
      setError(messageForActionError(actionError));
      setSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <PageHeader description={subtitle} title="Crear tu hogar" />
      <Card>
        <FormField
          autoCapitalize="words"
          autoComplete="name"
          error={error}
          label="Nombre del hogar"
          maxLength={100}
          onChangeText={setName}
          placeholder="Ej. Casa Ale & Kevin"
          returnKeyType="done"
          value={name}
        />
        <View style={styles.currencySection}>
          <Text style={m1TextStyles.secondary}>Moneda principal</Text>
          <View style={styles.currencyChip}>
            <Text style={styles.currencyChipLabel}>Guaraní · Gs.</Text>
          </View>
          <Text style={m1TextStyles.secondary}>
            Los gastos en USD se convierten con un tipo de cambio que cargás vos.
          </Text>
        </View>
        <ActionButton
          disabled={name.trim().length === 0}
          label="Crear hogar"
          loading={submitting}
          onPress={() => void submit()}
        />
      </Card>
      <Text
        accessibilityHint="Abre la pantalla para pegar un token de invitación"
        accessibilityRole="link"
        onPress={() => {
          router.push('/invitation');
        }}
        style={styles.invitationLink}
      >
        ¿Ya tenés una invitación? Ingresar token
      </Text>
      <ActionButton label="Cerrar sesión" onPress={() => void signOut()} variant="secondary" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  currencySection: {
    gap: themeTokens.spacing.base,
  },
  currencyChip: {
    alignSelf: 'flex-start',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primaryTint,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  currencyChipLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  invitationLink: {
    alignSelf: 'center',
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
    textDecorationLine: 'underline',
  },
});
