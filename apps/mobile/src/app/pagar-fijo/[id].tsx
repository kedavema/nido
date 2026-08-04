import type {
  Category,
  HouseholdMember,
  Occurrence,
  PaymentSource,
  RecurringItem,
  SettleOccurrenceRequest,
} from '@nido/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { AmountField, Chip, ChipRow, formFieldStyles } from '@/components/expense-form-fields';
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
import {
  amountToWireDecimal,
  isValidLocalDateString,
  localDateToOccurredAt,
} from '@/utils/expense-form';
import { formatOccurrenceAmount } from '@/utils/fijos-format';
import {
  categoryLabel,
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
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
      readonly members: readonly HouseholdMember[];
    };

function initialAmount(occurrence: Occurrence): string {
  return occurrence.currency === 'PYG' ? occurrence.amount : occurrence.amount.replace('.', ',');
}

export default function PagarFijoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, getMembers, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [screenState, setScreenState] = useState<ScreenState>({ kind: 'loading' });
  const [amount, setAmount] = useState('');
  const [paymentSourceId, setPaymentSourceId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(() => todayLocalDate());
  const [choosingDate, setChoosingDate] = useState(false);
  const [manualDate, setManualDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const load = useCallback(async () => {
    if (household === null) return;
    setScreenState({ kind: 'loading' });
    try {
      const [{ occurrences }, { recurringItems }, { categories }, { paymentSources }, { members }] =
        await Promise.all([
          catalog.listOccurrences(household.id),
          catalog.listRecurringItems(household.id),
          catalog.listCategories(household.id),
          catalog.listPaymentSources(household.id),
          getMembers(household.id),
        ]);
      const occurrence = occurrences.find((candidate) => candidate.id === id);
      if (occurrence === undefined) {
        setScreenState({ kind: 'error', message: 'No encontramos este vencimiento.' });
        return;
      }
      const item = recurringItems.find((candidate) => candidate.id === occurrence.recurringItemId);
      if (item === undefined) {
        setScreenState({ kind: 'error', message: 'No encontramos este gasto fijo.' });
        return;
      }
      setScreenState({ kind: 'loaded', occurrence, item, categories, paymentSources, members });
      setAmount(initialAmount(occurrence));
      setPaymentSourceId(item.paymentSourceId ?? null);
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

  const { occurrence, item, categories, paymentSources } = screenState;
  const currency = occurrence.currency;
  const todayLocal = todayLocalDate();
  const activeSources = paymentSources.filter((source) => source.isActive);
  const canConfirm = amount !== '' && amount !== '0';
  const verb = item.kind === 'INCOME' ? 'recibido' : 'pagado';
  const categoryText = categoryLabel(item.categoryId, categories) ?? 'Sin categoría';

  async function confirm(): Promise<void> {
    if (household === null || !canConfirm) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const request: SettleOccurrenceRequest = {
        amount: amountToWireDecimal(amount, currency),
        currency,
        ...(paymentSourceId === null ? {} : { paymentSourceId }),
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
          label={`Confirmar ${verb === 'pagado' ? 'pago' : 'cobro'}`}
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
          title={`Marcar como ${verb}`}
        />
      }
    >
      <AmountField
        accessibilityLabel="Importe real"
        autoFocus
        currency={currency}
        hint={
          <>
            Estimado: {formatOccurrenceAmount(occurrence.amount, currency)} · editá si{' '}
            {verb === 'pagado' ? 'pagaron' : 'recibieron'} otro monto
          </>
        }
        label={`Importe real ${verb}`}
        onChangeText={setAmount}
        value={amount}
        variant="centered"
      />

      <Text style={formFieldStyles.fieldLabel}>
        {verb === 'pagado' ? 'Pagado con' : 'Recibido en'}
      </Text>
      <ChipRow>
        {activeSources.map((source) => (
          <Chip
            key={source.id}
            label={source.name}
            onPress={() => {
              setPaymentSourceId((current) => (current === source.id ? null : source.id));
            }}
            selected={paymentSourceId === source.id}
          />
        ))}
        {activeSources.length === 0 ? (
          <Text style={m1TextStyles.secondary}>Sin medios de pago cargados.</Text>
        ) : null}
      </ChipRow>

      <Text style={formFieldStyles.fieldLabel}>Fecha de pago</Text>
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
      {choosingDate ? (
        <View style={formFieldStyles.field}>
          <TextInput
            accessibilityLabel="Otra fecha (aaaa-mm-dd)"
            onChangeText={(text) => {
              setManualDate(text);
              if (isValidLocalDateString(text)) {
                setPayDate(text);
              }
            }}
            placeholder="2026-07-15"
            placeholderTextColor={themeTokens.colors.inkSecondary}
            style={formFieldStyles.textField}
            value={manualDate}
          />
        </View>
      ) : null}

      <InlineNotice tone="success">
        Se crea el {item.kind === 'INCOME' ? 'ingreso' : 'gasto'} real en Movimientos:{' '}
        {categoryText} ·{' '}
        {formatOccurrenceAmount(amountToWireDecimal(amount || '0', currency), currency)}. Se{' '}
        {verb === 'pagado' ? 'paga' : 'cobra'} completo en un solo movimiento — no hay pagos
        parciales.
      </InlineNotice>

      {submitError === undefined ? null : <InlineNotice tone="error">{submitError}</InlineNotice>}
    </AppFormScreen>
  );
}
