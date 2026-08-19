import type {
  Category,
  CreateRecurringItemRequest,
  FrequencyKind,
  HouseholdMember,
  RecurringItem,
  UpdateRecurringItemRequest,
} from '@nido/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { DayOfMonthPicker, LocalDatePicker } from '@/components/date-picker';
import {
  AmountField,
  Chip,
  ChipRow,
  formFieldStyles,
  FormField,
  FormSection,
  Stepper,
} from '@/components/expense-form-fields';
import {
  ActionButton,
  AppFormScreen,
  AppScreen,
  FormHeader,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
} from '@/components/m1-ui';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { themeTokens } from '@/theme/tokens';
import { monthlyFirstDueDate } from '@/utils/date-picker';
import { amountToWireDecimal, isValidLocalDateString } from '@/utils/expense-form';
import { dayOfMonth, firstDueDatePreview } from '@/utils/fijos-format';
import { formatFullLocalDate, monthNameOf, todayLocalDate } from '@/utils/movement-format';

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
  /** Only meaningful once the chosen day has gone by; see `firstDueDatePreview`. */
  readonly startThisMonth: boolean;
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
      dayOfMonth: Math.min(today, 31),
      startThisMonth: false,
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
    // An existing rule already has a date; editing must not silently move it.
    startThisMonth: item.firstDueDate.slice(0, 7) === todayLocalDate().slice(0, 7),
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
      <AppScreen centered>
        <LoadingContent label="Cargando…" />
      </AppScreen>
    );
  }

  if (screenState.kind === 'error') {
    return (
      <AppScreen>
        <InlineNotice tone="error">{screenState.message}</InlineNotice>
        <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
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

  const { categories, members } = screenState;

  const usesDayOfMonth = draft.frequency === 'MONTHLY' || draft.frequency === 'EVERY_N_MONTHS';
  const nameValid = draft.name.trim() !== '';
  const amountValid = draft.amount !== '' && draft.amount !== '0';
  const dateValid = usesDayOfMonth || isValidLocalDateString(draft.firstDueDate);
  const {
    date: resolvedFirstDueDate,
    startsAfterThisMonth,
    dayAlreadyPassed,
  } = firstDueDatePreview(draft, todayLocal);
  const thisMonthFirstDueDate = monthlyFirstDueDate(draft.dayOfMonth, todayLocal, true);
  const nextMonthFirstDueDate = monthlyFirstDueDate(draft.dayOfMonth, todayLocal, false);
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
      ? monthlyFirstDueDate(draft.dayOfMonth, todayLocal, draft.startThisMonth)
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
      successFeedback();
      router.back();
    } catch (error) {
      errorFeedback();
      setSubmitError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppFormScreen
      footer={
        <>
          <ActionButton
            label="Guardar ingreso esperado"
            loading={saving}
            onPress={() => void save()}
          />
          <Text style={styles.footerHint}>
            Aparece en Ingresos como “esperado”, sin tocar el balance
          </Text>
        </>
      }
      header={
        <FormHeader
          onDismiss={() => {
            router.back();
          }}
          subtitle="Se suma al balance recién al recibirse"
          title={mode === 'create' ? 'Nuevo ingreso esperado' : 'Editar ingreso esperado'}
        />
      }
    >
      <FormField
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
          style={[
            formFieldStyles.textField,
            showValidation && !nameValid && formFieldStyles.textFieldError,
          ]}
          value={draft.name}
        />
      </FormField>

      <FormField
        label="Importe estimado"
        error={showValidation && !amountValid ? 'Completá este campo' : undefined}
      >
        <AmountField
          accessibilityLabel="Importe estimado"
          currency="PYG"
          onChangeText={(amount) => {
            update({ amount });
          }}
          value={draft.amount}
        />
        <Text style={m1TextStyles.secondary}>
          Al marcarlo recibido confirmás el importe real de ese mes.
        </Text>
      </FormField>

      <FormSection label="Recurrencia">
        <ChipRow>
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
        </ChipRow>
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
      </FormSection>

      <FormField label="Fecha esperada">
        {usesDayOfMonth ? (
          <DayOfMonthPicker
            accessibilityLabel="Fecha esperada"
            error={showValidation && !dateValid}
            onChange={(dayOfMonth) => {
              update({ dayOfMonth });
            }}
            testID="nuevo-ingreso-day-of-month"
            value={draft.dayOfMonth}
          />
        ) : (
          <LocalDatePicker
            accessibilityLabel="Fecha esperada"
            error={showValidation && !dateValid}
            onChange={(firstDueDate) => {
              update({ firstDueDate });
            }}
            testID="nuevo-ingreso-date"
            value={draft.firstDueDate}
          />
        )}
        {/*
          The fijo form has named the resolved date since #244; this one never did, so a day
          already gone by moved the schedule to next month with nothing on screen saying so.
        */}
        {resolvedFirstDueDate === null ? null : (
          <Text style={styles.dueDateHint}>
            Primera fecha: {formatFullLocalDate(resolvedFirstDueDate)}
            {startsAfterThisMonth ? ' · el día de este mes ya pasó' : ''}
            {dayAlreadyPassed && !startsAfterThisMonth ? ' · pendiente' : ''}
          </Text>
        )}
        {dayAlreadyPassed ? (
          <>
            <Text style={styles.dueDateHint}>Empezar en</Text>
            <ChipRow>
              <Chip
                label={monthNameOf(nextMonthFirstDueDate)}
                onPress={() => {
                  update({ startThisMonth: false });
                }}
                selected={!draft.startThisMonth}
              />
              <Chip
                label={monthNameOf(thisMonthFirstDueDate)}
                onPress={() => {
                  update({ startThisMonth: true });
                }}
                selected={draft.startThisMonth}
              />
            </ChipRow>
          </>
        ) : null}
      </FormField>

      <FormSection label="Lo recibe">
        <ChipRow>
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
        </ChipRow>
      </FormSection>

      {submitError === undefined ? null : <InlineNotice tone="error">{submitError}</InlineNotice>}
    </AppFormScreen>
  );
}

const styles = StyleSheet.create({
  // Same treatment as the fijo form's, so the two forms read alike.
  dueDateHint: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
  },
  footerHint: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    textAlign: 'center',
  },
});
