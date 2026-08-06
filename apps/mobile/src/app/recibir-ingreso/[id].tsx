import type {
  HouseholdMember,
  Occurrence,
  RecurringItem,
  SettleOccurrenceRequest,
} from '@nido/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { CalendarBoard } from '@/components/date-picker';
import { AmountField, Chip, ChipRow, formFieldStyles } from '@/components/expense-form-fields';
import {
  ActionButton,
  AppFormScreen,
  AppScreen,
  FormHeader,
  InlineNotice,
  LoadingContent,
} from '@/components/m1-ui';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { amountToWireDecimal, localDateToOccurredAt } from '@/utils/expense-form';
import { formatOccurrenceAmount } from '@/utils/fijos-format';
import {
  formatFullLocalDate,
  formatMonthLabel,
  monthFromLocalDate,
  todayLocalDate,
} from '@/utils/movement-format';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly occurrence: Occurrence;
      readonly item: RecurringItem;
      readonly members: readonly HouseholdMember[];
    };

function initialAmount(occurrence: Occurrence): string {
  return occurrence.currency === 'PYG' ? occurrence.amount : occurrence.amount.replace('.', ',');
}

export default function RecibirIngresoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [screenState, setScreenState] = useState<ScreenState>({ kind: 'loading' });
  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(() => todayLocalDate());
  const [choosingDate, setChoosingDate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const load = useCallback(async () => {
    if (household === null) return;
    setScreenState({ kind: 'loading' });
    try {
      const [{ occurrences }, { recurringItems }, { members }] = await Promise.all([
        catalog.listOccurrences(household.id),
        catalog.listRecurringItems(household.id),
        getMembers(household.id),
      ]);
      const occurrence = occurrences.find((candidate) => candidate.id === id);
      if (occurrence === undefined) {
        setScreenState({ kind: 'error', message: 'No encontramos este ingreso.' });
        return;
      }
      const item = recurringItems.find((candidate) => candidate.id === occurrence.recurringItemId);
      if (item === undefined) {
        setScreenState({ kind: 'error', message: 'No encontramos este ingreso esperado.' });
        return;
      }
      setScreenState({ kind: 'loaded', occurrence, item, members });
      setAmount(initialAmount(occurrence));
    } catch (error) {
      setScreenState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, getMembers, household, id]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (household === null || screenState.kind === 'loading') {
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

  const { occurrence, item } = screenState;
  const currency = occurrence.currency;
  const todayLocal = todayLocalDate();
  const canConfirm = amount !== '' && amount !== '0';

  async function confirm(): Promise<void> {
    if (household === null || !canConfirm) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      // Income settlement carries no payment source (the money lands, it isn't "paid from" an
      // account), so — unlike FIJ-04 — no paymentSourceId is ever sent.
      const request: SettleOccurrenceRequest = {
        amount: amountToWireDecimal(amount, currency),
        currency,
        settledAt: localDateToOccurredAt(payDate, todayLocal),
      };
      await catalog.settleOccurrence(household.id, occurrence.id, request);
      successFeedback();
      router.back();
    } catch (error) {
      errorFeedback();
      setSubmitError(messageForActionError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppFormScreen
      footer={
        <ActionButton
          disabled={!canConfirm}
          label="Confirmar ingreso"
          loading={submitting}
          onPress={() => void confirm()}
        />
      }
      header={
        <FormHeader
          onDismiss={() => {
            router.back();
          }}
          subtitle={`${item.name} · ${formatMonthLabel(monthFromLocalDate(occurrence.dueDate)).toLowerCase()}`}
          title="Marcar como recibido"
        />
      }
    >
      <AmountField
        accessibilityLabel="Importe real recibido"
        autoFocus
        currency={currency}
        hint={`Esperado: ${formatOccurrenceAmount(occurrence.amount, currency)} · editá si llegó otro monto`}
        label="Importe real recibido"
        onChangeText={setAmount}
        value={amount}
        variant="centered"
      />

      <Text style={formFieldStyles.fieldLabel}>Fecha</Text>
      <ChipRow>
        <Chip
          label={`Hoy · ${formatFullLocalDate(todayLocal).replace(/\s\d{4}$/u, '')}`}
          onPress={() => {
            setPayDate(todayLocal);
            setChoosingDate(false);
          }}
          selected={payDate === todayLocal && !choosingDate}
        />
        <Chip
          label={choosingDate ? formatFullLocalDate(payDate).replace(/\s\d{4}$/u, '') : 'Elegir…'}
          onPress={() => {
            setChoosingDate(true);
          }}
          selected={choosingDate || payDate !== todayLocal}
        />
      </ChipRow>
      {choosingDate ? <CalendarBoard onChange={setPayDate} value={payDate} /> : null}

      <InlineNotice tone="success">
        Se crea el ingreso real en Movimientos y el Balance del mes lo suma al instante. Se recibe
        completo — no hay cobros parciales.
      </InlineNotice>

      {submitError === undefined ? null : <InlineNotice tone="error">{submitError}</InlineNotice>}
    </AppFormScreen>
  );
}
