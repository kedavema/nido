import type { CreateHouseholdInviteResponse, HouseholdMember } from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
import {
  CREATE_TRANSACTION_MUTATION_TYPE,
  decideSignOutFlow,
  isCreateTransactionPayload,
} from '@/sync/sync-queue';
import { useSyncQueue } from '@/sync/sync-queue-provider';
import { themeTokens } from '@/theme/tokens';

/** MAS-01's "CONFIGURACIÓN FINANCIERA" only lists rows that map to a real, working screen today —
 * Informes / Importar movimientos / Moneda y tipo de cambio / Dispositivos y notificaciones are
 * future milestones, so a dead-end row would be worse than omitting them. */
type PaymentSourceNamesState =
  { readonly kind: 'loading' } | { readonly kind: 'loaded'; readonly names: readonly string[] };

type MembersState =
  | { readonly kind: 'loading'; readonly requestGeneration: number }
  | { readonly kind: 'loaded'; readonly members: readonly HouseholdMember[] }
  | { readonly kind: 'error'; readonly message: string };

/** "A y B" for two names, "A, B y C" for three or more — the only name-joining convention this
 * codebase has needed so far, so it's kept local to MAS-06's warning box rather than promoted to
 * a shared util for a single call site. */
function joinNamesEs(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')} y ${last ?? ''}`;
}

function formatExpiration(value: string): string {
  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Asuncion',
  }).format(new Date(value));
}

export default function MasScreen() {
  const { catalog, createInvitation, getMembers, signOut, state } = useSession();
  const { pending, discardAllPending } = useSyncQueue();
  // MAS-06's warning box names the affected transactions by description rather than just a count —
  // only `create-transaction` mutations carry one; anything else this queue might one day hold has
  // no description to show, so it's silently left out of the list rather than showing "undefined".
  const pendingExpenseNames = useMemo(
    () =>
      pending
        .filter((mutation) => mutation.type === CREATE_TRANSACTION_MUTATION_TYPE)
        .map((mutation) => mutation.payload)
        .filter(isCreateTransactionPayload)
        .map((payload) => payload.request.description.trim())
        .filter((name) => name !== ''),
    [pending],
  );
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [membersState, setMembersState] = useState<MembersState>({
    kind: 'loading',
    requestGeneration: 0,
  });
  const [membersRequest, setMembersRequest] = useState(0);
  const [paymentSourceNamesState, setPaymentSourceNamesState] = useState<PaymentSourceNamesState>({
    kind: 'loading',
  });
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

  useFocusEffect(
    useCallback(() => {
      if (household === null) {
        return undefined;
      }

      let active = true;
      void catalog
        .listPaymentSources(household.id)
        .then(({ paymentSources }) => {
          if (active) {
            setPaymentSourceNamesState({
              kind: 'loaded',
              names: paymentSources
                .filter((source) => source.isActive)
                .map((source) => source.name),
            });
          }
        })
        .catch(() => {
          // The "Medios de pago" row subtitle is a nice-to-have preview, not the source of truth
          // (that's payment-sources.tsx itself) — on failure just leave the row without a subtitle
          // rather than surfacing a second error UI on this screen.
          if (active) {
            setPaymentSourceNamesState({ kind: 'loaded', names: [] });
          }
        });

      return () => {
        active = false;
      };
    }, [catalog, household]),
  );

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  const userInitial =
    state.kind === 'authenticated'
      ? state.profile.user.displayName.trim().charAt(0).toUpperCase()
      : '';
  const paymentSourcesSubtitle =
    paymentSourceNamesState.kind === 'loading'
      ? 'Cargando…'
      : paymentSourceNamesState.names.length === 0
        ? 'Todavía no hay medios de pago'
        : paymentSourceNamesState.names.join(' · ');

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
    // The actual decision is `decideSignOutFlow` (sync-queue.ts) so it's directly testable.
    if (decideSignOutFlow(pending.length) === 'warn-about-pending') {
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
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <PageHeader description="Identidad, hogar e integrantes." title="Más" />
        </View>
        <View
          accessibilityLabel={`Sesión de ${state.kind === 'authenticated' ? state.profile.user.displayName : ''}`}
          style={styles.avatarChip}
        >
          <Text style={styles.avatarChipLabel}>{userInitial}</Text>
        </View>
      </View>
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
        <ConfigRow
          isFirst
          onPress={() => {
            router.push('/categories');
          }}
          subtitle="7 raíces fijas · subcategorías editables"
          title="Categorías y subcategorías"
        />
        <ConfigRow
          onPress={() => {
            router.push('/payment-sources');
          }}
          subtitle={paymentSourcesSubtitle}
          title="Medios de pago"
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
        pendingNames={pendingExpenseNames}
        visible={showPendingSyncWarning}
      />
    </AppScreen>
  );
}

/** A "CONFIGURACIÓN DEL HOGAR"-style tappable row: title + subtitle + trailing chevron. Only used
 * for rows that map to a real, working screen (see the module-level comment on why the reference's
 * Informes/Importar/Moneda/Dispositivos rows are intentionally omitted). */
function ConfigRow({
  title,
  subtitle,
  onPress,
  isFirst = false,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly onPress: () => void;
  readonly isFirst?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.configRow, !isFirst && styles.configRowDivider]}
    >
      <View style={styles.configCopy}>
        <Text style={m1TextStyles.body}>{title}</Text>
        <Text numberOfLines={1} style={m1TextStyles.secondary}>
          {subtitle}
        </Text>
      </View>
      <Ionicons color={themeTokens.colors.inkSecondary} name="chevron-forward" size={20} />
    </Pressable>
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
  pendingNames,
  onCancel,
  onConfirm,
}: {
  readonly visible: boolean;
  readonly pendingCount: number;
  readonly pendingNames: readonly string[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const countLabel =
    pendingCount === 1
      ? '1 movimiento sin sincronizar'
      : `${pendingCount.toString()} movimientos sin sincronizar`;
  const namesLabel = joinNamesEs(pendingNames);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            ¿Cerrar sesión?
          </Text>
          <View style={styles.warningBox}>
            <Ionicons
              color={themeTokens.semanticColors.warning.foreground}
              name="warning"
              size={18}
              style={styles.warningIcon}
            />
            <Text style={styles.warningText}>
              Hay <Text style={styles.warningTextBold}>{countLabel}</Text> en este teléfono
              {namesLabel === '' ? '' : ` (${namesLabel})`}. Si cerrás sesión ahora,{' '}
              <Text style={styles.warningTextBold}>se pierden</Text>.
            </Text>
          </View>
          <Text style={m1TextStyles.secondary}>
            Conectate a internet y esperá el ✓ de sincronización antes de salir.
          </Text>
          <View style={styles.modalActions}>
            <View style={styles.actionColumn}>
              <ActionButton label="Cancelar" onPress={onCancel} variant="secondary" />
            </View>
            <View style={styles.actionColumn}>
              <ActionButton label="Cerrar igual" onPress={onConfirm} variant="danger" />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: themeTokens.spacing.cardGap,
  },
  headerCopy: {
    flex: 1,
  },
  avatarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeTokens.colors.primary,
  },
  avatarChipLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  configRow: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
  },
  configRowDivider: {
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    paddingTop: themeTokens.spacing.cardGap,
  },
  configCopy: {
    flex: 1,
  },
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.semanticColors.warning.background,
    padding: 12,
  },
  warningIcon: {
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    color: themeTokens.semanticColors.warning.foreground,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    lineHeight: 19,
  },
  warningTextBold: {
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
});
