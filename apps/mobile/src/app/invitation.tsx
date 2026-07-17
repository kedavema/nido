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

export default function InvitationScreen() {
  const router = useRouter();
  const { acceptInvitation } = useSession();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function accept(): Promise<void> {
    setSubmitting(true);
    setError(undefined);

    try {
      await acceptInvitation(token);
    } catch (actionError) {
      setError(messageForActionError(actionError));
      setSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <PageHeader
        description="Pegá el token que te compartió la persona propietaria del hogar."
        eyebrow="Invitación"
        title="Entrar a un hogar"
      />
      <Card>
        <Text style={m1TextStyles.body}>
          Iniciá sesión con el mismo correo de Google al que se dirigió la invitación.
        </Text>
        <FormField
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
          label="Token de invitación"
          maxLength={43}
          onChangeText={setToken}
          placeholder="Pegá acá el token de 43 caracteres"
          returnKeyType="done"
          value={token}
        />
        <ActionButton
          disabled={token.length !== 43}
          label="Aceptar invitación"
          loading={submitting}
          onPress={() => void accept()}
        />
      </Card>
      <InlineNotice>
        El token es de un solo uso. Nido no lo guarda en este dispositivo ni lo escribe en logs.
      </InlineNotice>
      <ActionButton
        label="Volver"
        onPress={() => {
          router.back();
        }}
        variant="secondary"
      />
    </AppScreen>
  );
}
