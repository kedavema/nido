import { useState } from 'react';
import { useRouter } from 'expo-router';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  ActionButton,
  AppScreen,
  Card,
  FormField,
  InlineNotice,
  PageHeader,
  m1TextStyles,
} from '@/components/m1-ui';
import { Text } from 'react-native';

export default function OnboardingScreen() {
  const router = useRouter();
  const { createHousehold, signOut } = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

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
      <PageHeader
        description="Creá un hogar nuevo o ingresá el token que te compartieron."
        eyebrow="Primer paso"
        title="¿Cómo querés entrar?"
      />
      <Card>
        <Text style={m1TextStyles.sectionTitle}>Crear un hogar</Text>
        <Text style={m1TextStyles.secondary}>
          Vas a quedar como OWNER y después podrás invitar al segundo integrante.
        </Text>
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
        <ActionButton
          disabled={name.trim().length === 0}
          label="Crear hogar"
          loading={submitting}
          onPress={() => void submit()}
        />
      </Card>
      <Card>
        <Text style={m1TextStyles.sectionTitle}>Ya tengo una invitación</Text>
        <Text style={m1TextStyles.secondary}>
          Solo la cuenta de Google invitada puede aceptar el token, y vence a las 72 horas.
        </Text>
        <ActionButton
          label="Ingresar invitación"
          onPress={() => {
            router.push('/invitation');
          }}
          variant="secondary"
        />
      </Card>
      <InlineNotice>
        El correo y la membresía se validan en el servidor; no alcanza con conocer el UUID de un
        hogar.
      </InlineNotice>
      <ActionButton label="Cerrar sesión" onPress={() => void signOut()} variant="secondary" />
    </AppScreen>
  );
}
