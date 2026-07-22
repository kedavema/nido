import type { HouseholdMember, PaymentSource, PaymentSourceType } from '@nido/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { themeTokens } from '@/theme/tokens';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly sources: readonly PaymentSource[];
      readonly members: readonly HouseholdMember[];
    };
interface Draft {
  readonly id?: string;
  readonly name: string;
  readonly type: PaymentSourceType;
  readonly ownerUserId: string | null;
  readonly isActive: boolean;
}
const EMPTY_DRAFT: Draft = { name: '', type: 'CASH', ownerUserId: null, isActive: true };
const TYPES: readonly (readonly [PaymentSourceType, string])[] = [
  ['BANK_ACCOUNT', 'Cuenta bancaria'],
  ['CASH', 'Efectivo'],
  ['CREDIT_CARD', 'Tarjeta de crédito'],
  ['DIGITAL_WALLET', 'Billetera digital'],
  ['OTHER', 'Otro'],
];

export default function PaymentSourcesScreen() {
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  const load = useCallback(async () => {
    if (household === null) return;
    setLoadState({ kind: 'loading' });
    try {
      const [{ paymentSources }, { members }] = await Promise.all([
        catalog.listPaymentSources(household.id),
        getMembers(household.id),
      ]);
      setLoadState({
        kind: 'loaded',
        sources: paymentSources,
        members: members.filter((member) => member.status === 'ACTIVE'),
      });
    } catch (error) {
      setLoadState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, getMembers, household]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (household === null)
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  const householdId = household.id;
  const members = loadState.kind === 'loaded' ? loadState.members : [];

  async function save(): Promise<void> {
    if (draft === null) return;
    setSaving(true);
    setFormError(undefined);
    try {
      if (draft.id === undefined)
        await catalog.createPaymentSource(householdId, {
          name: draft.name,
          type: draft.type,
          ...(draft.ownerUserId === null ? {} : { ownerUserId: draft.ownerUserId }),
        });
      else
        await catalog.updatePaymentSource(householdId, draft.id, {
          name: draft.name,
          type: draft.type,
          ownerUserId: draft.ownerUserId,
          isActive: draft.isActive,
        });
      setDraft(null);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(source: PaymentSource): Promise<void> {
    try {
      await catalog.deletePaymentSource(householdId, source.id);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    }
  }

  return (
    <AppScreen>
      <ActionButton
        label="Volver"
        onPress={() => {
          router.back();
        }}
        variant="secondary"
      />
      <PageHeader
        description="Son informativos: Nido no calcula saldos por medio."
        title="Medios de pago"
      />
      {draft === null ? null : (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>
            {draft.id === undefined ? 'Nuevo medio' : 'Editar medio'}
          </Text>
          <FormField
            label="Nombre"
            maxLength={100}
            onChangeText={(name) => {
              setDraft({ ...draft, name });
            }}
            value={draft.name}
          />
          <Choice
            label="Tipo"
            options={TYPES}
            selected={draft.type}
            onSelect={(type) => {
              setDraft({ ...draft, type });
            }}
          />
          <Choice
            label="Titular informativo"
            options={[
              [null, 'Sin titular'],
              ...members.map((member) => [member.userId, member.displayName] as const),
            ]}
            selected={draft.ownerUserId}
            onSelect={(ownerUserId) => {
              setDraft({ ...draft, ownerUserId });
            }}
          />
          {draft.id === undefined ? null : (
            <Choice
              label="Estado"
              options={[
                [true, 'Activo'],
                [false, 'Archivado'],
              ]}
              selected={draft.isActive}
              onSelect={(isActive) => {
                setDraft({ ...draft, isActive });
              }}
            />
          )}
          {formError === undefined ? null : <InlineNotice tone="error">{formError}</InlineNotice>}
          <ActionButton
            disabled={draft.name.trim() === ''}
            label="Guardar"
            loading={saving}
            onPress={() => void save()}
          />
          <ActionButton
            label="Cancelar"
            onPress={() => {
              setDraft(null);
            }}
            variant="secondary"
          />
        </Card>
      )}
      {loadState.kind === 'loading' ? <LoadingContent label="Cargando medios…" /> : null}
      {loadState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{loadState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
        </>
      ) : null}
      {loadState.kind === 'loaded' && loadState.sources.length === 0 ? (
        <InlineNotice>Todavía no hay medios de pago.</InlineNotice>
      ) : null}
      {loadState.kind === 'loaded' && loadState.sources.length > 0 ? (
        <Card>
          {[...loadState.sources]
            .sort((a, b) => Number(b.isActive) - Number(a.isActive))
            .map((source, index) => (
              <View key={source.id} style={index > 0 && styles.rowDivider}>
                <View style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={m1TextStyles.body}>{source.name}</Text>
                    <Text style={m1TextStyles.secondary}>
                      {TYPES.find(([type]) => type === source.type)?.[1]}
                      {source.ownerUserId === null
                        ? ''
                        : ` · ${loadState.members.find((member) => member.userId === source.ownerUserId)?.displayName ?? 'Titular'}`}
                      {source.isActive ? '' : ' · Archivado'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setDraft({
                        id: source.id,
                        name: source.name,
                        type: source.type,
                        ownerUserId: source.ownerUserId,
                        isActive: source.isActive,
                      });
                    }}
                  >
                    <Text style={styles.link}>Editar</Text>
                  </Pressable>
                  {source.isActive ? (
                    <Pressable accessibilityRole="button" onPress={() => void remove(source)}>
                      <Text style={styles.danger}>Eliminar</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
        </Card>
      ) : null}

      {draft === null ? (
        <>
          <OutlinePillButton
            label="+ Agregar medio de pago"
            onPress={() => {
              setDraft(EMPTY_DRAFT);
            }}
          />
          <Text style={m1TextStyles.secondary}>
            Un medio con movimientos no se borra: se archiva (deja de ofrecerse al cargar, el
            historial queda intacto).
          </Text>
        </>
      ) : null}
    </AppScreen>
  );
}

function OutlinePillButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
    >
      <Text style={styles.outlineButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function Choice<T extends string | boolean | null>({
  label,
  options,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly (readonly [T, string])[];
  readonly selected: T;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <View style={styles.wrap}>
        {options.map(([value, text]) => (
          <Pressable
            accessibilityRole="button"
            key={String(value)}
            onPress={() => {
              onSelect(value);
            }}
            style={[styles.choice, selected === value && styles.selected]}
          >
            <Text style={m1TextStyles.secondary}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivider: {
    marginTop: themeTokens.spacing.cardGap,
    paddingTop: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
  },
  outlineButton: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.radii.button,
    backgroundColor: 'transparent',
    paddingHorizontal: themeTokens.spacing.cardPadding,
    paddingVertical: 10,
  },
  outlineButtonPressed: {
    opacity: 0.78,
  },
  outlineButtonLabel: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    textAlign: 'center',
  },
  copy: { flex: 1 },
  link: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  danger: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  choices: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
  },
  selected: {
    backgroundColor: themeTokens.colors.primaryTint,
    borderColor: themeTokens.colors.primary,
  },
});
