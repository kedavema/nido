import type { CreateHouseholdInviteResponse, HouseholdMember } from '@nido/contracts';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  ActionButton,
  AppScreen,
  Card,
  FormField,
  InlineNotice,
  LoadingContent,
  PageHeader,
  m1TextStyles,
} from '@/components/m1-ui';
import { createInvitationRequestGuard } from '@/invitations/invitation-request-guard';
import { useSyncQueue } from '@/sync/sync-queue-provider';
import { themeTokens } from '@/theme/tokens';

type MembersState =
  | { readonly kind: 'loading'; readonly requestGeneration: number }
  | { readonly kind: 'loaded'; readonly members: readonly HouseholdMember[] }
  | { readonly kind: 'error'; readonly message: string };

function formatExpiration(value: string): string {
  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Asuncion',
  }).format(new Date(value));
}

export default function MasScreen() {
  const { createInvitation, getMembers, signOut, state } = useSession();
  const { pending, discardAllPending } = useSyncQueue();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [membersState, setMembersState] = useState<MembersState>({
    kind: 'loading',
    requestGeneration: 0,
  });
  const [membersRequest, setMembersRequest] = useState(0);
  const [email, setEmail] = useState('');
  const [inviteError, setInviteError] = useState<string>();
  const [sendingInvite, setSendingInvite] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateHouseholdInviteResponse>();
  const [showPendingSyncWarning, setShowPendingSyncWarning] = useState(false);
  const inviteRequestGuard = useRef(createInvitationRequestGuard()).current;

  useFocusEffect(
    useCallback(
      () => () => {
        inviteRequestGuard.invalidate();
        setCreatedInvite(undefined);
        setInviteError(undefined);
        setSendingInvite(false);
      },
      [inviteRequestGuard],
    ),
  );

  useFocusEffect(
    useCallback(() => {
      if (household === null) {
        return undefined;
      }

      let active = true;
      setMembersState({ kind: 'loading', requestGeneration: membersRequest });

      void getMembers(household.id)
        .then(({ members }) => {
          if (active) {
            setMembersState({ kind: 'loaded', members });
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setMembersState({ kind: 'error', message: messageForActionError(error) });
          }
        });

      return () => {
        active = false;
      };
    }, [getMembers, household, membersRequest]),
  );

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  async function invite(): Promise<void> {
    if (household === null) {
      return;
    }

    setSendingInvite(true);
    setInviteError(undefined);
    const isCurrentRequest = inviteRequestGuard.begin();

    try {
      const response = await createInvitation(household.id, email);
      if (!isCurrentRequest()) {
        return;
      }

      setCreatedInvite(response);
      setEmail('');
    } catch (error) {
      if (isCurrentRequest()) {
        setInviteError(messageForActionError(error));
      }
    } finally {
      if (isCurrentRequest()) {
        setSendingInvite(false);
      }
    }
  }

  function retryMembers(): void {
    setMembersState({ kind: 'loading', requestGeneration: membersRequest + 1 });
    setMembersRequest((value) => value + 1);
  }

  function handleSignOutPress(): void {
    // §11 / ADR 0008: a queued mutation is tied to whoever is signed in when it finally syncs,
    // so signing out with pending mutations must warn explicitly instead of discarding silently.
    if (pending.length > 0) {
      setShowPendingSyncWarning(true);
      return;
    }
    void signOut();
  }

  async function discardPendingAndSignOut(): Promise<void> {
    setShowPendingSyncWarning(false);
    await discardAllPending();
    await signOut();
  }

  return (
    <AppScreen>
      <PageHeader description="Identidad, hogar e integrantes." title="Más" />
      <Card>
        <Text style={m1TextStyles.sectionTitle}>{household.name}</Text>
        <View style={styles.detailRow}>
          <Text style={m1TextStyles.secondary}>Tu rol</Text>
          <Text style={m1TextStyles.body}>
            {household.role === 'OWNER' ? 'Propietario/a' : 'Integrante'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={m1TextStyles.secondary}>Moneda base</Text>
          <Text style={m1TextStyles.body}>{household.baseCurrency}</Text>
        </View>
      </Card>

      <Card>
        <Text style={m1TextStyles.sectionTitle}>Configuración financiera</Text>
        <Text style={m1TextStyles.secondary}>
          Organizá las categorías y los medios compartidos de {household.name}.
        </Text>
        <ActionButton
          label="Categorías"
          onPress={() => {
            router.push('/categories');
          }}
          variant="secondary"
        />
        <ActionButton
          label="Medios de pago"
          onPress={() => {
            router.push('/payment-sources');
          }}
          variant="secondary"
        />
      </Card>

      <Card>
        <Text style={m1TextStyles.sectionTitle}>Integrantes</Text>
        {membersState.kind === 'loading' ? <LoadingContent label="Cargando integrantes…" /> : null}
        {membersState.kind === 'error' ? (
          <>
            <InlineNotice tone="error">{membersState.message}</InlineNotice>
            <ActionButton label="Reintentar" onPress={retryMembers} variant="secondary" />
          </>
        ) : null}
        {membersState.kind === 'loaded'
          ? membersState.members.map((member) => <MemberRow key={member.userId} member={member} />)
          : null}
      </Card>

      {household.role === 'OWNER' ? (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>Invitar al segundo integrante</Text>
          {createdInvite === undefined ? (
            <>
              <Text style={m1TextStyles.secondary}>
                La invitación dura 72 horas y solo funciona con el correo indicado.
              </Text>
              <FormField
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                error={inviteError}
                inputMode="email"
                keyboardType="email-address"
                label="Correo de Google"
                maxLength={254}
                onChangeText={setEmail}
                placeholder="persona@example.com"
                returnKeyType="send"
                value={email}
              />
              <ActionButton
                disabled={email.trim().length === 0}
                label="Crear invitación"
                loading={sendingInvite}
                onPress={() => void invite()}
              />
            </>
          ) : (
            <InviteReceipt
              invite={createdInvite}
              onClear={() => {
                setCreatedInvite(undefined);
                setInviteError(undefined);
              }}
            />
          )}
        </Card>
      ) : null}

      <ActionButton label="Cerrar sesión" onPress={handleSignOutPress} variant="danger" />

      <PendingSyncSignOutModal
        onCancel={() => {
          setShowPendingSyncWarning(false);
        }}
        onConfirm={() => void discardPendingAndSignOut()}
        pendingCount={pending.length}
        visible={showPendingSyncWarning}
      />
    </AppScreen>
  );
}

function MemberRow({ member }: { readonly member: HouseholdMember }) {
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberCopy}>
        <Text style={m1TextStyles.body}>{member.displayName}</Text>
        <Text style={m1TextStyles.secondary}>
          {member.role === 'OWNER' ? 'Propietario/a' : 'Integrante'}
        </Text>
      </View>
      <Text style={member.status === 'ACTIVE' ? styles.activeStatus : styles.removedStatus}>
        {member.status === 'ACTIVE' ? 'Activo' : 'Removido'}
      </Text>
    </View>
  );
}

function InviteReceipt({
  invite,
  onClear,
}: {
  readonly invite: CreateHouseholdInviteResponse;
  readonly onClear: () => void;
}) {
  return (
    <>
      <InlineNotice tone="success">Invitación creada para {invite.invite.email}.</InlineNotice>
      <Text style={m1TextStyles.secondary}>
        Vence el {formatExpiration(invite.invite.expiresAt)}. Compartí este token por un canal
        privado; solo se muestra en esta pantalla.
      </Text>
      <View style={styles.tokenBox}>
        <Text selectable accessibilityLabel="Token de invitación" style={m1TextStyles.token}>
          {invite.token}
        </Text>
      </View>
      <Text style={m1TextStyles.secondary}>
        Mantené presionado el token para copiarlo. Al salir o crear otra invitación, Nido lo elimina
        de esta vista.
      </Text>
      <ActionButton label="Crear otra invitación" onPress={onClear} variant="secondary" />
    </>
  );
}

function PendingSyncSignOutModal({
  visible,
  pendingCount,
  onCancel,
  onConfirm,
}: {
  readonly visible: boolean;
  readonly pendingCount: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            Tenés movimientos sin sincronizar
          </Text>
          <Text style={m1TextStyles.secondary}>
            {pendingCount === 1
              ? 'Este teléfono guardó 1 movimiento'
              : `Este teléfono guardó ${pendingCount.toString()} movimientos`}{' '}
            que todavía no se sincronizaron. Quedaron guardados con esta cuenta: si cerrás sesión
            ahora, no van a sincronizar y se pierden.
          </Text>
          <View style={styles.modalActions}>
            <View style={styles.actionColumn}>
              <ActionButton label="Seguir con la sesión" onPress={onCancel} variant="secondary" />
            </View>
            <View style={styles.actionColumn}>
              <ActionButton
                label="Descartar y cerrar sesión"
                onPress={onConfirm}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: themeTokens.spacing.cardGap,
  },
  memberRow: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: themeTokens.spacing.cardGap,
  },
  memberCopy: {
    flex: 1,
  },
  activeStatus: {
    overflow: 'hidden',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.semanticColors.success.background,
    color: themeTokens.semanticColors.success.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removedStatus: {
    overflow: 'hidden',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.semanticColors.danger.background,
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tokenBox: {
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surfaceMuted,
    padding: 12,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(38, 48, 44, 0.55)',
  },
  modalSheet: {
    width: '100%',
    gap: themeTokens.spacing.cardGap,
    borderTopLeftRadius: themeTokens.radii.modal,
    borderTopRightRadius: themeTokens.radii.modal,
    backgroundColor: themeTokens.colors.surface,
    padding: themeTokens.spacing.screen,
  },
  modalTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
  },
  modalActions: {
    flexDirection: 'row',
    gap: themeTokens.spacing.cardGap,
  },
  actionColumn: {
    flex: 1,
  },
});
