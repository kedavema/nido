import type {
  Category,
  CreateRecurringItemRequest,
  FrequencyKind,
  HouseholdMember,
  RecurringItem,
  UpdateRecurringItemRequest,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { ActionButton, InlineNotice, LoadingContent, m1TextStyles } from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';
import {
  amountToWireDecimal,
  formatAmountDisplay,
  isValidLocalDateString,
  sanitizeAmountInput,
} from '@/utils/expense-form';
import { dayOfMonth } from '@/utils/fijos-format';
import { todayLocalDate } from '@/utils/movement-format';

const FREQUENCY_OPTIONS: readonly (readonly [FrequencyKind, string])[] = [
  ['ONE_TIME', 'Una vez'],
  ['MONTHLY', 'Mensual'],
  ['YEARLY', 'Anual'],
  ['EVERY_N_MONTHS', 'Cada X meses'],
];

interface Draft {
  readonly id?: string;
  // Preserved verbatim on edit so an income keeps whatever income category it was created with;
  // create resolves this from the household's income categories at save time (see `save`).
  readonly categoryId?: string;
  readonly name: string;
  readonly amount: string;
  readonly frequency: FrequencyKind;
  readonly intervalMonths: number;
  readonly dayOfMonth: number;
  readonly firstDueDate: string;
  readonly responsibleUserId: string | null;
}

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly categories: readonly Category[];
      readonly members: readonly HouseholdMember[];
    };

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** First due date for a day-of-month recurrence: this month if the day hasn't passed, else next. */
function monthlyFirstDueDate(day: number, todayLocal: string): string {
  const [year = 1970, month = 1, today = 1] = todayLocal.split('-').map(Number);
  const clampedDay = Math.min(Math.max(day, 1), 28);
  let targetYear = year;
  let targetMonth = month;
  if (clampedDay < today) {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }
  return `${targetYear.toString()}-${pad2(targetMonth)}-${pad2(clampedDay)}`;
}

/** The first active INCOME root category — the default `categoryId` auto-assigned to a new income. */
function firstIncomeRootCategory(categories: readonly Category[]): Category | undefined {
  return categories.find(
    (category) => category.kind === 'INCOME' && category.isActive && category.parentId === null,
  );
}

function buildDraft(item: RecurringItem | null, todayLocal: string): Draft {
  if (item === null) {
    const [, , today = 1] = todayLocal.split('-').map(Number);
    return {
      name: '',
      amount: '',
      // Freelance / one-off income is the primary ING use-case (ONB-02), so a one-time income is
      // the sensible default — matching the "Una vez" chip pre-selected in the ING-02 reference.
      frequency: 'ONE_TIME',
      intervalMonths: 2,
      dayOfMonth: Math.min(today, 28),
      firstDueDate: todayLocal,
      responsibleUserId: null,
    };
  }
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    amount: item.currency === 'PYG' ? item.estimatedAmount : item.estimatedAmount.replace('.', ','),
    frequency: item.frequency,
    intervalMonths: item.intervalMonths ?? 2,
    dayOfMonth: dayOfMonth(item.firstDueDate),
    firstDueDate: item.firstDueDate,
    responsibleUserId: item.responsibleUserId,
  };
}

export default function NuevoIngresoScreen() {
  const { recurringItemId } = useLocalSearchParams<{ recurringItemId?: string }>();
  const mode: 'create' | 'edit' = recurringItemId === undefined ? 'create' : 'edit';
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const currentUserId = state.kind === 'authenticated' ? state.profile.user.id : undefined;

  const [screenState, setScreenState] = useState<ScreenState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [showValidation, setShowValidation] = useState(false);

  const todayLocal = todayLocalDate();

  const load = useCallback(async () => {
    if (household === null) return;
    setScreenState({ kind: 'loading' });
    try {
      const [{ categories }, { members }, item] = await Promise.all([
        catalog.listCategories(household.id),
        getMembers(household.id),
        recurringItemId === undefined
          ? Promise.resolve(null)
          : catalog
              .listRecurringItems(household.id)
              .then(
                ({ recurringItems }) =>
                  recurringItems.find((candidate) => candidate.id === recurringItemId) ?? null,
              ),
      ]);
      setScreenState({
        kind: 'ready',
        categories,
        members: members.filter((member) => member.status === 'ACTIVE'),
      });
      const initial = buildDraft(item, todayLocal);
      setDraft(
        item === null && currentUserId !== undefined
          ? { ...initial, responsibleUserId: currentUserId }
          : initial,
      );
    } catch (error) {
      setScreenState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, getMembers, household, recurringItemId, todayLocal, currentUserId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (household === null || screenState.kind === 'loading' || draft === null) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <LoadingContent label="Cargando…" />
      </SafeAreaView>
    );
  }

  if (screenState.kind === 'error') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.content}>
          <InlineNotice tone="error">{screenState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
          <ActionButton
            label="Volver"
            onPress={() => {
              router.back();
            }}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    );
  }

  const { categories, members } = screenState;

  const usesDayOfMonth = draft.frequency === 'MONTHLY' || draft.frequency === 'EVERY_N_MONTHS';
  const nameValid = draft.name.trim() !== '';
  const amountValid = draft.amount !== '' && draft.amount !== '0';
  const dateValid = usesDayOfMonth || isValidLocalDateString(draft.firstDueDate);
  const canSave = nameValid && amountValid && dateValid;

  function update(patch: Partial<Draft>): void {
    setDraft((current) => (current === null ? current : { ...current, ...patch }));
  }

  async function save(): Promise<void> {
    if (draft === null || household === null) return;
    if (!canSave) {
      setShowValidation(true);
      return;
    }
    setSaving(true);
    setSubmitError(undefined);
    const firstDueDate = usesDayOfMonth
      ? monthlyFirstDueDate(draft.dayOfMonth, todayLocal)
      : draft.firstDueDate;
    const estimatedAmount = amountToWireDecimal(draft.amount, 'PYG');
    try {
      if (draft.id === undefined) {
        // ING-02 has no category field, but the API requires a non-null categoryId. We auto-assign
        // the household's first active INCOME root category (the seed always ships Sueldo / Trabajo
        // independiente / Reembolso, so one exists); the settle flow lets the user recategorize the
        // real movement later if needed.
        const incomeCategory = firstIncomeRootCategory(categories);
        if (incomeCategory === undefined) {
          setSubmitError('No encontramos una categoría de ingresos. Creá una y volvé a intentar.');
          return;
        }
        const request: CreateRecurringItemRequest = {
          kind: 'INCOME',
          name: draft.name.trim(),
          categoryId: incomeCategory.id,
          estimatedAmount,
          currency: 'PYG',
          frequency: draft.frequency,
          ...(draft.frequency === 'EVERY_N_MONTHS' ? { intervalMonths: draft.intervalMonths } : {}),
          firstDueDate,
          ...(draft.responsibleUserId === null
            ? {}
            : { responsibleUserId: draft.responsibleUserId }),
        };
        await catalog.createRecurringItem(household.id, request);
      } else {
        const request: UpdateRecurringItemRequest = {
          name: draft.name.trim(),
          estimatedAmount,
          currency: 'PYG',
          frequency: draft.frequency,
          intervalMonths: draft.frequency === 'EVERY_N_MONTHS' ? draft.intervalMonths : null,
          firstDueDate,
          responsibleUserId: draft.responsibleUserId,
        };
        await catalog.updateRecurringItem(household.id, draft.id, request);
      }
      router.back();
    } catch (error) {
      setSubmitError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              router.back();
            }}
            style={styles.closeButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="close" size={20} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              {mode === 'create' ? 'Nuevo ingreso esperado' : 'Editar ingreso esperado'}
            </Text>
            <Text style={m1TextStyles.secondary}>Se suma al balance recién al recibirse</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label="Nombre"
            error={showValidation && !nameValid ? 'Completá este campo' : undefined}
          >
            <TextInput
              accessibilityLabel="Nombre"
              maxLength={100}
              onChangeText={(name) => {
                update({ name });
              }}
              placeholder="Freelance Ale"
              placeholderTextColor={themeTokens.colors.inkSecondary}
              style={[styles.input, showValidation && !nameValid && styles.inputError]}
              value={draft.name}
            />
          </Field>

          <Field
            label="Importe estimado"
            error={showValidation && !amountValid ? 'Completá este campo' : undefined}
          >
            <View style={[styles.amountField, showValidation && !amountValid && styles.inputError]}>
              <Text style={styles.amountPrefix}>Gs.</Text>
              <TextInput
                accessibilityLabel="Importe estimado"
                keyboardType="number-pad"
                onChangeText={(text) => {
                  update({ amount: sanitizeAmountInput(text, 'PYG') });
                }}
                placeholder="0"
                placeholderTextColor={themeTokens.colors.inkSecondary}
                style={styles.amountInput}
                value={formatAmountDisplay(draft.amount, 'PYG')}
              />
            </View>
            <Text style={m1TextStyles.secondary}>
              Al marcarlo recibido confirmás el importe real de ese mes.
            </Text>
          </Field>

          <Field label="Recurrencia">
            <View style={styles.chipRow}>
              {FREQUENCY_OPTIONS.map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  onPress={() => {
                    update({ frequency: value });
                  }}
                  selected={draft.frequency === value}
                />
              ))}
            </View>
            {draft.frequency === 'EVERY_N_MONTHS' ? (
              <Stepper
                label="cada"
                onDecrement={() => {
                  update({ intervalMonths: Math.max(1, draft.intervalMonths - 1) });
                }}
                onIncrement={() => {
                  update({ intervalMonths: draft.intervalMonths + 1 });
                }}
                unit="meses"
                value={draft.intervalMonths}
              />
            ) : null}
          </Field>

          <Field label="Fecha esperada">
            {usesDayOfMonth ? (
              <Stepper
                label="El día"
                onDecrement={() => {
                  update({ dayOfMonth: Math.max(1, draft.dayOfMonth - 1) });
                }}
                onIncrement={() => {
                  update({ dayOfMonth: Math.min(28, draft.dayOfMonth + 1) });
                }}
                unit="de cada mes"
                value={draft.dayOfMonth}
              />
            ) : (
              <TextInput
                accessibilityLabel="Fecha esperada (aaaa-mm-dd)"
                onChangeText={(firstDueDate) => {
                  update({ firstDueDate });
                }}
                placeholder="2026-07-28"
                placeholderTextColor={themeTokens.colors.inkSecondary}
                style={[styles.input, showValidation && !dateValid && styles.inputError]}
                value={draft.firstDueDate}
              />
            )}
          </Field>

          <Field label="Lo recibe">
            <View style={styles.chipRow}>
              {members.map((member) => (
                <Chip
                  key={member.userId}
                  label={member.displayName}
                  onPress={() => {
                    update({
                      responsibleUserId:
                        draft.responsibleUserId === member.userId ? null : member.userId,
                    });
                  }}
                  selected={draft.responsibleUserId === member.userId}
                />
              ))}
            </View>
          </Field>

          {submitError === undefined ? null : (
            <InlineNotice tone="error">{submitError}</InlineNotice>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <ActionButton
            label="Guardar ingreso esperado"
            loading={saving}
            onPress={() => void save()}
          />
          <Text style={styles.footerHint}>
            Aparece en Ingresos como “esperado”, sin tocar el balance
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  readonly label: string;
  readonly error?: string | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stepper({
  label,
  value,
  unit,
  onDecrement,
  onIncrement,
}: {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={m1TextStyles.body}>{label}</Text>
      <Pressable
        accessibilityLabel="Restar"
        accessibilityRole="button"
        onPress={onDecrement}
        style={styles.stepperButton}
      >
        <Ionicons color={themeTokens.colors.primary} name="remove" size={18} />
      </Pressable>
      <Text style={styles.stepperValue}>{value.toString()}</Text>
      <Pressable
        accessibilityLabel="Sumar"
        accessibilityRole="button"
        onPress={onIncrement}
        style={styles.stepperButton}
      >
        <Ionicons color={themeTokens.colors.primary} name="add" size={18} />
      </Pressable>
      <Text style={m1TextStyles.body}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeTokens.colors.background,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.base,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: themeTokens.colors.surface,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  content: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.screen,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  input: {
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: themeTokens.semanticColors.danger.foreground,
  },
  errorText: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodyMedium,
    fontSize: themeTokens.typography.scale.secondary,
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
  },
  amountPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    paddingVertical: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 16,
  },
  chipSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
  },
  chipText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    maxWidth: 200,
  },
  chipTextSelected: {
    color: themeTokens.colors.surface,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  footer: {
    gap: 4,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.cardGap,
    paddingBottom: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.background,
  },
  footerHint: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    textAlign: 'center',
  },
});
