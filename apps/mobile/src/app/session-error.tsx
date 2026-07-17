import { ActionButton, AppScreen, Card, InlineNotice, PageHeader } from '@/components/m1-ui';
import { useSession } from '@/auth/session-provider';

export default function SessionErrorScreen() {
  const { retry, signOut, state } = useSession();
  const message = state.kind === 'error' ? state.message : 'No pudimos iniciar Nido.';
  const canSignOut = state.kind === 'error' && state.canSignOut;

  return (
    <AppScreen centered>
      <PageHeader
        description="Tus datos no se modificaron."
        eyebrow="Necesitamos tu atención"
        title="No pudimos conectar"
      />
      <Card>
        <InlineNotice tone="error">{message}</InlineNotice>
        <ActionButton label="Reintentar" onPress={retry} />
        {canSignOut ? (
          <ActionButton label="Cerrar sesión" onPress={() => void signOut()} variant="secondary" />
        ) : null}
      </Card>
    </AppScreen>
  );
}
