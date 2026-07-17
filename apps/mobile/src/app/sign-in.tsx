import { ActionButton, AppScreen, Card, PageHeader, m1TextStyles } from '@/components/m1-ui';
import { useSession } from '@/auth/session-provider';
import { Text } from 'react-native';

export default function SignInScreen() {
  const { signIn } = useSession();

  return (
    <AppScreen centered>
      <PageHeader
        description="Compartí los gastos del hogar con la persona que elegís."
        eyebrow="Nido"
        title="Tu hogar, en un solo lugar"
      />
      <Card>
        <Text style={m1TextStyles.body}>
          Iniciá sesión con Google para crear tu hogar o aceptar una invitación.
        </Text>
        <ActionButton
          accessibilityHint="Abre el inicio de sesión seguro de Google"
          label="Continuar con Google"
          onPress={() => void signIn()}
        />
      </Card>
      <Text style={m1TextStyles.secondary}>
        Nido usa tu identidad de Firebase para proteger el acceso. La membresía del hogar siempre se
        verifica en el servidor.
      </Text>
    </AppScreen>
  );
}
