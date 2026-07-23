import type {
  HouseholdMember,
  Occurrence,
  RecurringItem,
  SettleOccurrenceRequest,
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
  localDateToOccurredAt,
  sanitizeAmountInput,
} from '@/utils/expense-form';
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
  const [manualDate, setManualDate] = useState('');
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
      router.back();
    } catch (error) {
      setSubmitError(messageForActionError(error));
    } finally {
      setSubmitting(false);
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
            <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
              Marcar como recibido
            </Text>
            <Text style={m1TextStyles.secondary}>
              {item.name} · {formatMonthLabel(monthFromLocalDate(occurrence.dueDate)).toLowerCase()}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.amountLabel}>Importe real recibido</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>{currency === 'PYG' ? 'Gs.' : 'USD'}</Text>
            <TextInput
              accessibilityLabel="Importe real recibido"
              autoFocus
              keyboardType={currency === 'PYG' ? 'number-pad' : 'decimal-pad'}
              onChangeText={(text) => {
                setAmount(sanitizeAmountInput(text, currency));
              }}
              placeholder="0"
              placeholderTextColor={themeTokens.colors.inkSecondary}
              style={styles.amountInput}
              value={formatAmountDisplay(amount, currency)}
            />
          </View>
          <Text style={styles.amountHint}>
            Esperado: {formatOccurrenceAmount(occurrence.amount, currency)} · editá si llegó otro
            monto
          </Text>

          <Text style={styles.fieldLabel}>Fecha</Text>
          <View style={styles.chipRow}>
            <Chip
              label={`Hoy · ${formatFullLocalDate(todayLocal).replace(/\s\d{4}$/u, '')}`}
              onPress={() => {
                setPayDate(todayLocal);
                setChoosingDate(false);
              }}
              selected={payDate === todayLocal && !choosingDate}
            />
            <Chip
              label={
                choosingDate ? formatFullLocalDate(payDate).replace(/\s\d{4}$/u, '') : 'Elegir…'
              }
              onPress={() => {
                setChoosingDate(true);
              }}
              selected={choosingDate || payDate !== todayLocal}
            />
          </View>
          {choosingDate ? (
            <View style={styles.field}>
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
                style={styles.dateInput}
                value={manualDate}
              />
            </View>
          ) : null}

          <InlineNotice tone="success">
            Se crea el ingreso real en Movimientos y el Balance del mes lo suma al instante. Se
            recibe completo — no hay cobros parciales.
          </InlineNotice>

          {submitError === undefined ? null : (
            <InlineNotice tone="error">{submitError}</InlineNotice>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <ActionButton
            disabled={!canConfirm}
            label="Confirmar ingreso"
            loading={submitting}
            onPress={() => void confirm()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  amountLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    textAlign: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  amountPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
    paddingBottom: 8,
  },
  amountInput: {
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displayBold,
    fontSize: 44,
    padding: 0,
    textAlign: 'center',
  },
  amountHint: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    textAlign: 'center',
  },
  fieldLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
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
  field: {
    gap: 8,
  },
  dateInput: {
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
  footer: {
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.cardGap,
    paddingBottom: themeTokens.spacing.cardGap,
    borderTopWidth: 1,
    borderTopColor: themeTokens.colors.border,
    backgroundColor: themeTokens.colors.background,
  },
});
