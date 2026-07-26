import { useState } from 'react';
import { useRouter } from 'expo-router';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  ActionButton,
  AppFormScreen,
  Card,
  FormField,
  FormHeader,
  InlineNotice,
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
    <AppFormScreen
      footer={
        <ActionButton
          disabled={token.length !== 43}
          label="Aceptar invitación"
          loading={submitting}
          onPress={() => void accept()}
        />
      }
      header={
        // The former "Volver" button at the foot of the content becomes the
        // header's back chevron: pinned, thumb-reachable, and never buried under
        // the keyboard.
        <FormHeader
          dismissIcon="back"
          onDismiss={() => {
            router.back();
          }}
          subtitle="Pegá el token que te compartió la persona propietaria del hogar."
          title="Entrar a un hogar"
        />
      }
    >
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
          onSubmitEditing={() => void accept()}
          placeholder="Pegá acá el token de 43 caracteres"
          returnKeyType="done"
          value={token}
        />
      </Card>
      <InlineNotice>
        El token es de un solo uso. Nido no lo guarda en este dispositivo ni lo escribe en logs.
      </InlineNotice>
    </AppFormScreen>
  );
}
