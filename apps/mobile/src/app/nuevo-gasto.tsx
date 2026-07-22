import type {
  Category,
  CategoryKind,
  CreateTransactionRequest,
  PaymentSource,
  Transaction,
  TransactionCurrency,
  TransactionType,
  UpdateTransactionRequest,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
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
import {
  ActionButton,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  SyncStatusPill,
} from '@/components/m1-ui';
import type { CreateExpenseOutcome } from '@/sync/sync-queue';
import { useSyncQueue } from '@/sync/sync-queue-provider';
import { cardShadowStyle } from '@/theme/styles';
import { themeTokens } from '@/theme/tokens';
import {
  amountToWireDecimal,
  favoritePaymentSourceIds,
  formatAmountDisplay,
  formatFxRateDisplay,
  fxRateToWireDecimal,
  fxRateWireToSanitized,
  isValidLocalDateString,
  localDateToOccurredAt,
  mostRecentUsdRate,
  previewUsdToBasePyg,
  recentRootCategoryIds,
  sanitizeAmountInput,
  sanitizeFxRateInput,
  shiftLocalDate,
} from '@/utils/expense-form';
import {
  categoryLabel,
  formatFullLocalDate,
  formatMonthLabel,
  formatPygMagnitude,
  formatRecentMovementDateLabel,
  monthFromLocalDate,
  todayLocalDate,
} from '@/utils/movement-format';

// M3 #38 ("Nuevo/editar gasto form"). Scope decision, spelled out because the design set (GAS-01/
// 02/05/06/07, MOV-04) is ambiguous on it: creation is EXPENSE-only — GAS-01/GAS-02 show no
// type toggle at all, and the route/title is literally "Nuevo gasto". Editing reuses this same
// screen for whichever `type` the loaded transaction already has (the Movimientos detail screen's
// "Editar" already targets this route for both expenses and incomes), but `type` is never
// user-editable here — no design screen exposes a way to flip it. MOV-04's caption additionally
// describes a slimmed income-edit variant (no category/payment-source chips, plus a "quién lo
// recibe" field) — that's NOT implemented: `categoryId` is a non-nullable required field on the
// wire contract for every transaction regardless of type, and "quién lo recibe" has no
// corresponding field anywhere in `TransactionSchema`/`UpdateTransactionRequestSchema`, so
// building either would mean inventing unspecified API surface. Both expense and income edits
// get the full form here, with category/subcategory chips filtered to the transaction's own
// `type` (EXPENSE-kind vs INCOME-kind categories).
//
// The "Eliminar gasto" link MOV-04 shows inline is also intentionally left out: deletion already
// has a real, tested entry point on the Movimientos detail screen (#37's
// `app/movimiento/[id].tsx`), and the issue's own Deliverable list doesn't call for a second one.
//
// Amount entry: no custom on-screen keypad component exists yet in `components/`, and GAS-01's
// digit grid doesn't add any interaction the platform's native numeric keyboard doesn't already
// provide (locale-correct layout, backspace, no cursor-management bugs) — so the amount field is
// a plain `TextInput` with `keyboardType="number-pad"` (Gs.) / `"decimal-pad"` (USD) rather than a
// pixel-matched custom keypad.

const EMPTY_CATEGORIES: readonly Category[] = [];
const EMPTY_PAYMENT_SOURCES: readonly PaymentSource[] = [];
const EMPTY_TRANSACTIONS: readonly Transaction[] = [];

type Mode = 'create' | 'edit';

/**
 * Snapshot of what was just saved, built from the draft at submit time (not refetched from the
 * server) — GAS-03/GAS-04's dedicated save-confirmation view (M4 UI QA #63) renders straight off
 * this instead of the old inline-banner-then-auto-navigate-back behavior. Scoped to `mode ===
 * 'create'` only: editing an existing transaction still just navigates back on save, matching the
 * design set (both references are captioned around the "Nuevo gasto" flow, and "Cargar otro
 * gasto" only makes sense after a fresh save).
 */
interface SavedExpenseSummary {
  readonly outcome: CreateExpenseOutcome;
  readonly description: string;
  readonly categoryId: string;
  readonly paymentSourceId: string | null;
  readonly localDate: string;
  readonly amountDisplay: string;
}

interface Draft {
  readonly type: TransactionType;
  readonly currency: TransactionCurrency;
  readonly amount: string; // sanitized display value (see utils/expense-form.ts)
  readonly fxRate: string; // sanitized comma-decimal (see sanitizeFxRateInput), only meaningful when currency === 'USD'
  readonly categoryId: string | undefined;
  readonly paymentSourceId: string | null;
  readonly localDate: string;
  readonly occurredAt: string;
  readonly description: string;
  readonly notes: string;
}

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
      readonly transactions: readonly Transaction[];
      readonly original: Transaction | null;
    };

function buildDraft(original: Transaction | null, todayLocal: string): Draft {
  if (original === null) {
    return {
      type: 'EXPENSE',
      currency: 'PYG',
      amount: '',
      fxRate: '',
      categoryId: undefined,
      paymentSourceId: null,
      localDate: todayLocal,
      occurredAt: localDateToOccurredAt(todayLocal, todayLocal),
      description: '',
      notes: '',
    };
  }
  return {
    type: original.type,
    currency: original.currency,
    amount: original.currency === 'PYG' ? original.amount : original.amount.replace('.', ','),
    fxRate: original.fxRateToBase === null ? '' : fxRateWireToSanitized(original.fxRateToBase),
    categoryId: original.categoryId,
    paymentSourceId: original.paymentSourceId,
    localDate: original.localDate,
    occurredAt: original.occurredAt,
    description: original.description,
    notes: original.notes ?? '',
  };
}

export default function NuevoGastoScreen() {
  const { transactionId } = useLocalSearchParams<{ transactionId?: string }>();
  const mode: Mode = transactionId === undefined ? 'create' : 'edit';
  const { catalog, getMembers, state } = useSession();
  const syncQueue = useSyncQueue();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const currentUserId = state.kind === 'authenticated' ? state.profile.user.id : undefined;

  const [screenState, setScreenState] = useState<ScreenState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [savedExpense, setSavedExpense] = useState<SavedExpenseSummary | null>(null);
  const [otherMemberName, setOtherMemberName] = useState<string>();
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPaymentSourcePicker, setShowPaymentSourcePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);

  const todayLocal = todayLocalDate();

  const load = useCallback(async () => {
    if (household === null) return;
    setScreenState({ kind: 'loading' });
    try {
      const [{ categories }, { paymentSources }, { transactions }, original] = await Promise.all([
        catalog.listCategories(household.id),
        catalog.listPaymentSources(household.id),
        catalog.listTransactions(household.id),
        transactionId === undefined
          ? Promise.resolve(null)
          : catalog
              .getTransaction(household.id, transactionId)
              .then((response) => response.transaction),
      ]);
      setScreenState({ kind: 'ready', categories, paymentSources, transactions, original });
      // Initialized here (from the fetch callback), not from a reactive effect keyed on
      // `screenState` — that would call setState synchronously within an effect body, which
      // React's rules flag as a cascading-render risk. This runs exactly once per successful load.
      const initial = buildDraft(original, todayLocal);
      setDraft(initial);
      setDirty(false);
      setNotesExpanded(initial.notes !== '');
    } catch (error) {
      setScreenState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, household, transactionId, todayLocal]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    // Only worth asking for on the synced ('created') path — GAS-03's "{la otra persona} ya lo
    // puede ver" line names whoever else is in the household. A 'queued' save has no server
    // round-trip to hang this off of (and may well be offline), so GAS-04 never needs it.
    if (savedExpense?.outcome !== 'created' || household === null) {
      return;
    }
    let active = true;
    getMembers(household.id)
      .then(({ members }) => {
        if (!active) return;
        const other = members.find(
          (member) => member.userId !== currentUserId && member.status === 'ACTIVE',
        );
        setOtherMemberName(other?.displayName);
      })
      .catch(() => {
        // Best-effort only: the confirmation copy falls back to a name-free sentence if this
        // fails, it never blocks or errors the confirmation screen itself.
      });
    return () => {
      active = false;
    };
  }, [savedExpense, household, getMembers, currentUserId]);

  function updateDraft(patch: Partial<Draft>): void {
    setDraft((current) => (current === null ? current : { ...current, ...patch }));
    setDirty(true);
  }

  const categories = useMemo(
    () => (screenState.kind === 'ready' ? screenState.categories : EMPTY_CATEGORIES),
    [screenState],
  );
  const paymentSources = useMemo(
    () => (screenState.kind === 'ready' ? screenState.paymentSources : EMPTY_PAYMENT_SOURCES),
    [screenState],
  );
  const transactions = useMemo(
    () => (screenState.kind === 'ready' ? screenState.transactions : EMPTY_TRANSACTIONS),
    [screenState],
  );

  const defaultUsdRate = useMemo(() => mostRecentUsdRate(transactions), [transactions]);

  const categoryKind: CategoryKind = draft?.type ?? 'EXPENSE';

  const recentRootIds = useMemo(
    () => recentRootCategoryIds(transactions, categories, categoryKind, todayLocal),
    [transactions, categories, categoryKind, todayLocal],
  );

  const selectedCategory = categories.find((category) => category.id === draft?.categoryId);
  const selectedRootId = selectedCategory?.parentId ?? selectedCategory?.id;

  const rootCategoryChips = useMemo(() => {
    const roots = categories.filter(
      (category) =>
        category.kind === categoryKind && category.isActive && category.parentId === null,
    );
    const ids = [
      ...new Set([selectedRootId, ...recentRootIds].filter((id): id is string => id !== undefined)),
    ];
    const chips = ids
      .map((id) => roots.find((root) => root.id === id))
      .filter((root): root is Category => root !== undefined);
    if (chips.length > 0) return chips.slice(0, 3);
    // No usage history yet: fall back to the first 3 active roots so the form isn't empty.
    return roots.slice(0, 3);
  }, [categories, categoryKind, recentRootIds, selectedRootId]);

  const subcategoryChips = useMemo(() => {
    if (selectedRootId === undefined) return [];
    const children = categories.filter(
      (category) => category.parentId === selectedRootId && category.isActive,
    );
    if (children.length === 0) return [];
    const selectedChildId =
      selectedCategory?.parentId === undefined ? undefined : selectedCategory.id;
    const ordered = [
      ...new Set(
        [selectedChildId, ...children.map((child) => child.id)].filter(
          (id): id is string => id !== undefined,
        ),
      ),
    ];
    return ordered
      .map((id) => children.find((child) => child.id === id))
      .filter((child): child is Category => child !== undefined)
      .slice(0, 3);
  }, [categories, selectedRootId, selectedCategory]);

  const activePaymentSourceIds = useMemo(
    () => new Set(paymentSources.filter((source) => source.isActive).map((source) => source.id)),
    [paymentSources],
  );
  const favoriteSourceIds = useMemo(
    () => favoritePaymentSourceIds(transactions, activePaymentSourceIds),
    [transactions, activePaymentSourceIds],
  );
  const paymentSourceChips = useMemo(() => {
    const ids = [
      ...new Set(
        [draft?.paymentSourceId ?? undefined, ...favoriteSourceIds].filter(
          (id): id is string => id !== undefined,
        ),
      ),
    ];
    const chips = ids
      .map((id) => paymentSources.find((source) => source.id === id && source.isActive))
      .filter((source): source is PaymentSource => source !== undefined);
    if (chips.length > 0) return chips.slice(0, 3);
    return paymentSources.filter((source) => source.isActive).slice(0, 3);
  }, [paymentSources, favoriteSourceIds, draft?.paymentSourceId]);

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

  if (mode === 'create' && savedExpense !== null) {
    return (
      <SavedExpenseConfirmation
        categories={categories}
        onCargarOtro={startNewExpense}
        onListo={() => {
          router.back();
        }}
        otherMemberName={otherMemberName}
        paymentSources={paymentSources}
        saved={savedExpense}
        todayLocal={todayLocal}
      />
    );
  }

  const isIncome = draft.type === 'INCOME';
  const noun = isIncome ? 'ingreso' : 'gasto';
  const title = mode === 'create' ? 'Nuevo gasto' : `Editar ${noun}`;
  const submitLabel = mode === 'create' ? 'Guardar gasto' : 'Guardar cambios';

  const canSubmit =
    draft.categoryId !== undefined &&
    draft.description.trim() !== '' &&
    draft.amount !== '' &&
    (draft.currency === 'PYG' || draft.fxRate !== '');

  function handleClose(): void {
    if (dirty) {
      setShowDiscardModal(true);
    } else {
      router.back();
    }
  }

  /** "Cargar otro gasto" on the save confirmation — resets to a blank draft and stays on this
   * route rather than navigating anywhere, per GAS-03/GAS-04. */
  function startNewExpense(): void {
    setSavedExpense(null);
    setOtherMemberName(undefined);
    setDraft(buildDraft(null, todayLocal));
    setDirty(false);
    setNotesExpanded(false);
    setSubmitError(undefined);
  }

  function selectCurrency(currency: TransactionCurrency): void {
    if (draft === null || currency === draft.currency) return;
    updateDraft({
      currency,
      amount: '',
      fxRate:
        currency === 'USD'
          ? defaultUsdRate === undefined
            ? ''
            : fxRateWireToSanitized(defaultUsdRate.fxRateToBase)
          : draft.fxRate,
    });
  }

  function selectCategory(category: Category): void {
    updateDraft({ categoryId: category.id });
  }

  function selectPaymentSource(paymentSourceId: string | null): void {
    updateDraft({ paymentSourceId });
  }

  function selectLocalDate(localDate: string): void {
    updateDraft({ localDate, occurredAt: localDateToOccurredAt(localDate, todayLocal) });
    setShowDatePicker(false);
  }

  async function submit(): Promise<void> {
    if (
      draft === null ||
      household === null ||
      screenState.kind !== 'ready' ||
      draft.categoryId === undefined
    ) {
      return;
    }
    setSubmitError(undefined);
    setSaving(true);
    try {
      const amountWire = amountToWireDecimal(draft.amount, draft.currency);
      const fxRateWire = draft.currency === 'USD' ? fxRateToWireDecimal(draft.fxRate) : null;
      const trimmedNotes = draft.notes.trim();
      const trimmedDescription = draft.description.trim();
      const original = screenState.original;

      if (original === null) {
        const request: CreateTransactionRequest = {
          type: 'EXPENSE',
          amount: amountWire,
          currency: draft.currency,
          ...(fxRateWire === null ? {} : { fxRateToBase: fxRateWire }),
          occurredAt: draft.occurredAt,
          categoryId: draft.categoryId,
          ...(draft.paymentSourceId === null ? {} : { paymentSourceId: draft.paymentSourceId }),
          description: trimmedDescription,
          ...(trimmedNotes === '' ? {} : { notes: trimmedNotes }),
        };
        // Always attempts the direct request first (per docs/system-design.md §10) and only
        // falls back to the local queue on a genuine network failure — see syncQueue.createExpense.
        // `result.outcome` is exactly the signal GAS-03 vs GAS-04 need: 'created' means the server
        // already has it (online/synced copy + green pill), 'queued' means it's only local so far
        // (offline copy + amber pill) — see SavedExpenseSummary/SavedExpenseConfirmation below.
        const result = await syncQueue.createExpense(household.id, request);
        setSavedExpense({
          outcome: result.outcome,
          description: trimmedDescription,
          categoryId: draft.categoryId,
          paymentSourceId: draft.paymentSourceId,
          localDate: draft.localDate,
          amountDisplay: `${draft.currency === 'PYG' ? 'Gs.' : 'USD'} ${formatAmountDisplay(draft.amount, draft.currency)}`,
        });
      } else {
        const request: UpdateTransactionRequest = {
          amount: amountWire,
          currency: draft.currency,
          fxRateToBase: fxRateWire,
          occurredAt: draft.occurredAt,
          categoryId: draft.categoryId,
          paymentSourceId: draft.paymentSourceId,
          description: trimmedDescription,
          notes: trimmedNotes === '' ? null : trimmedNotes,
        };
        await catalog.updateTransaction(household.id, original.id, request);
        router.back();
      }
    } catch (error) {
      setSubmitError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  const usdPreview =
    draft.currency === 'USD' && draft.amount !== '' && draft.fxRate !== ''
      ? previewUsdToBasePyg(
          amountToWireDecimal(draft.amount, 'USD'),
          fxRateToWireDecimal(draft.fxRate),
        )
      : undefined;

  const discardSummary = [
    draft.amount === ''
      ? undefined
      : `${draft.currency === 'PYG' ? 'Gs.' : 'USD'} ${formatAmountDisplay(draft.amount, draft.currency)}`,
    categoryLabel(draft.categoryId ?? '', categories),
    draft.description.trim() === '' ? undefined : draft.description.trim(),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' · ');

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
            onPress={handleClose}
            style={styles.closeButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="close" size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {title}
          </Text>
          <CurrencyToggle onSelect={selectCurrency} selected={draft.currency} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AmountField
            currency={draft.currency}
            onChangeText={(amount) => {
              updateDraft({ amount });
            }}
            value={draft.amount}
          />

          {draft.currency === 'USD' ? (
            <View style={styles.fxCard}>
              <View style={styles.fxRow}>
                <View style={styles.fxCopy}>
                  <Text style={m1TextStyles.body}>Tipo de cambio (manual)</Text>
                  {defaultUsdRate === undefined ? null : (
                    <Text style={m1TextStyles.secondary}>
                      Último usado:{' '}
                      {formatFullLocalDate(defaultUsdRate.localDate).replace(/\s\d{4}$/u, '')}
                    </Text>
                  )}
                </View>
                <View style={styles.fxRateInputWrap}>
                  <Text style={m1TextStyles.secondary}>Gs.</Text>
                  <TextInput
                    accessibilityLabel="Tipo de cambio manual"
                    keyboardType="decimal-pad"
                    onChangeText={(text) => {
                      updateDraft({ fxRate: sanitizeFxRateInput(text) });
                    }}
                    style={styles.fxRateInput}
                    value={formatFxRateDisplay(draft.fxRate)}
                  />
                </View>
              </View>
              {usdPreview === undefined ? null : (
                <Text style={styles.fxPreview}>≈ Gs. {formatPygMagnitude(usdPreview)}</Text>
              )}
            </View>
          ) : null}

          <Section
            label="Categoría"
            onSeeAll={() => {
              setShowCategoryPicker(true);
            }}
            sublabel={
              rootCategoryChips.length > 0 && selectedRootId !== undefined ? 'recientes' : undefined
            }
          >
            <ChipRow>
              {rootCategoryChips.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  onPress={() => {
                    selectCategory(category);
                  }}
                  selected={selectedRootId === category.id}
                />
              ))}
            </ChipRow>
          </Section>

          {subcategoryChips.length === 0 ? null : (
            <Section label="Subcategoría (opcional)">
              <ChipRow>
                {subcategoryChips.map((child) => (
                  <Chip
                    key={child.id}
                    label={child.name}
                    onPress={() => {
                      selectCategory(child);
                    }}
                    selected={draft.categoryId === child.id}
                  />
                ))}
              </ChipRow>
            </Section>
          )}

          <Section
            label="Pagado con"
            onSeeAll={() => {
              setShowPaymentSourcePicker(true);
            }}
            sublabel={paymentSourceChips.length > 0 ? 'favoritos' : undefined}
          >
            <ChipRow>
              {paymentSourceChips.map((source) => (
                <Chip
                  key={source.id}
                  label={source.name}
                  onPress={() => {
                    selectPaymentSource(source.id);
                  }}
                  selected={draft.paymentSourceId === source.id}
                />
              ))}
            </ChipRow>
          </Section>

          <View style={styles.row}>
            <View style={styles.rowColumn}>
              <Text style={styles.fieldLabel}>Fecha</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowDatePicker(true);
                }}
                style={styles.dateField}
              >
                <Text style={m1TextStyles.body}>
                  {draft.localDate === todayLocal ? 'Hoy · ' : ''}
                  {formatFullLocalDate(draft.localDate)}
                </Text>
                <Ionicons color={themeTokens.colors.inkSecondary} name="chevron-down" size={16} />
              </Pressable>
            </View>
            <View style={styles.rowColumn}>
              <Text style={styles.fieldLabel}>Comercio</Text>
              <TextInput
                accessibilityLabel="Comercio"
                maxLength={200}
                onChangeText={(description) => {
                  updateDraft({ description });
                }}
                placeholder="¿Dónde fue?"
                placeholderTextColor={themeTokens.colors.inkSecondary}
                style={styles.textField}
                value={draft.description}
              />
            </View>
          </View>

          {notesExpanded ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nota (opcional)</Text>
              <TextInput
                accessibilityLabel="Nota"
                maxLength={2000}
                multiline
                onChangeText={(notes) => {
                  updateDraft({ notes });
                }}
                style={[styles.textField, styles.notesField]}
                value={draft.notes}
              />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotesExpanded(true);
              }}
              style={styles.addNote}
            >
              <Text style={styles.addNoteText}>+ Agregar nota (opcional)</Text>
            </Pressable>
          )}

          {submitError === undefined ? null : (
            <InlineNotice tone="error">{submitError}</InlineNotice>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <ActionButton
            disabled={!canSubmit}
            label={submitLabel}
            loading={saving}
            onPress={() => void submit()}
          />
        </View>
      </KeyboardAvoidingView>

      <CategoryPickerModal
        categories={categories.filter(
          (category) => category.kind === categoryKind && category.isActive,
        )}
        onClose={() => {
          setShowCategoryPicker(false);
        }}
        onSelect={(category) => {
          selectCategory(category);
          setShowCategoryPicker(false);
        }}
        selectedCategoryId={draft.categoryId}
        visible={showCategoryPicker}
      />

      <PaymentSourcePickerModal
        favoriteIds={favoriteSourceIds}
        onClose={() => {
          setShowPaymentSourcePicker(false);
        }}
        onSelect={(paymentSourceId) => {
          selectPaymentSource(paymentSourceId);
          setShowPaymentSourcePicker(false);
        }}
        paymentSources={paymentSources.filter((source) => source.isActive)}
        selectedPaymentSourceId={draft.paymentSourceId}
        visible={showPaymentSourcePicker}
      />

      <DatePickerModal
        onClose={() => {
          setShowDatePicker(false);
        }}
        onSelect={selectLocalDate}
        todayLocal={todayLocal}
        visible={showDatePicker}
      />

      <DiscardConfirmModal
        noun={noun}
        onCancel={() => {
          setShowDiscardModal(false);
        }}
        onDiscard={() => {
          setShowDiscardModal(false);
          router.back();
        }}
        summary={discardSummary}
        visible={showDiscardModal}
      />
    </SafeAreaView>
  );
}

function CurrencyToggle({
  selected,
  onSelect,
}: {
  readonly selected: TransactionCurrency;
  readonly onSelect: (currency: TransactionCurrency) => void;
}) {
  return (
    <View style={styles.currencyToggle}>
      {(['PYG', 'USD'] as const).map((currency) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selected === currency }}
          key={currency}
          onPress={() => {
            onSelect(currency);
          }}
          style={[styles.currencyOption, selected === currency && styles.currencyOptionActive]}
        >
          <Text
            style={[
              styles.currencyOptionText,
              selected === currency && styles.currencyOptionTextActive,
            ]}
          >
            {currency === 'PYG' ? 'Gs.' : 'USD'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function AmountField({
  currency,
  value,
  onChangeText,
}: {
  readonly currency: TransactionCurrency;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.amountRow}>
      <Text style={styles.amountPrefix}>{currency === 'PYG' ? 'Gs.' : 'USD'}</Text>
      <TextInput
        accessibilityLabel="Monto"
        autoFocus
        keyboardType={currency === 'PYG' ? 'number-pad' : 'decimal-pad'}
        onChangeText={(text) => {
          onChangeText(sanitizeAmountInput(text, currency));
        }}
        placeholder="0"
        placeholderTextColor={themeTokens.colors.inkSecondary}
        style={styles.amountInput}
        value={formatAmountDisplay(value, currency)}
      />
    </View>
  );
}

function Section({
  label,
  sublabel,
  onSeeAll,
  children,
}: {
  readonly label: string;
  readonly sublabel?: string | undefined;
  readonly onSeeAll?: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.fieldLabel}>
          {label}
          {sublabel === undefined ? '' : ` · ${sublabel}`}
        </Text>
        {onSeeAll === undefined ? null : (
          <Pressable accessibilityRole="button" onPress={onSeeAll}>
            <Text style={styles.seeAll}>Ver todas ›</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function ChipRow({ children }: { readonly children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
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

function CategoryPickerModal({
  visible,
  categories,
  selectedCategoryId,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly categories: readonly Category[];
  readonly selectedCategoryId: string | undefined;
  readonly onSelect: (category: Category) => void;
  readonly onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  // Root-expand/collapse state, same `Record<id, boolean>` toggle pattern as `categories.tsx`'s
  // `expandedRoots`/`toggleRoot`. GAS-05 shows tapping a root expanding it inline to reveal
  // subcategory chips (plus "Sin subcategoría") rather than selecting+closing immediately —
  // before this, `onSelect(root)` fired straight from the root row's onPress, so the chip row
  // below it (which already existed) was unreachable except via search or a pre-existing
  // selection. Only a root actually gets this state; picking a chip still selects+closes.
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const query = search.trim().toLowerCase();
  const roots = categories.filter((category) => category.parentId === null);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.pickerHeaderRow}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="close" size={20} />
          </Pressable>
          <View>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              Elegir categoría
            </Text>
            <Text style={m1TextStyles.secondary}>Para este gasto</Text>
          </View>
        </View>
        <View style={styles.searchRow}>
          <Ionicons color={themeTokens.colors.inkSecondary} name="search" size={18} />
          <TextInput
            accessibilityLabel="Buscar categoría o subcategoría"
            onChangeText={setSearch}
            placeholder="Buscar categoría o subcategoría…"
            placeholderTextColor={themeTokens.colors.inkSecondary}
            style={styles.searchInput}
            value={search}
          />
        </View>
        <ScrollView contentContainerStyle={styles.pickerList}>
          {roots.map((root) => {
            const children = categories.filter((category) => category.parentId === root.id);
            const matchesRoot = query === '' || root.name.toLowerCase().includes(query);
            const filteredChildren = children.filter(
              (child) => query === '' || matchesRoot || child.name.toLowerCase().includes(query),
            );
            if (query !== '' && !matchesRoot && filteredChildren.length === 0) {
              return null;
            }
            const containsSelection =
              selectedCategoryId === root.id ||
              children.some((child) => child.id === selectedCategoryId);
            const expanded =
              query !== '' ||
              expandedRoots[root.id] === true ||
              (expandedRoots[root.id] !== false && containsSelection);
            return (
              <View key={root.id} style={styles.pickerRootGroup}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (children.length === 0) {
                      onSelect(root);
                      return;
                    }
                    setExpandedRoots((current) => ({ ...current, [root.id]: !expanded }));
                  }}
                  style={styles.pickerRootRow}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: `${root.color}26` }]}>
                    <Text style={[styles.pickerAvatarText, { color: root.color }]}>
                      {root.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.pickerRootCopy}>
                    <Text style={m1TextStyles.body}>{root.name}</Text>
                    <Text numberOfLines={1} style={m1TextStyles.secondary}>
                      {children.map((child) => child.name).join(' · ') || 'Sin subcategorías'}
                    </Text>
                  </View>
                  {children.length > 0 ? (
                    <Ionicons
                      color={themeTokens.colors.inkSecondary}
                      name={expanded ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                    />
                  ) : null}
                </Pressable>
                {expanded && children.length > 0 ? (
                  <ChipRow>
                    {(query === '' ? children : filteredChildren).map((child) => (
                      <Chip
                        key={child.id}
                        label={child.name}
                        onPress={() => {
                          onSelect(child);
                        }}
                        selected={selectedCategoryId === child.id}
                      />
                    ))}
                    <Chip
                      label="Sin subcategoría"
                      onPress={() => {
                        onSelect(root);
                      }}
                      selected={selectedCategoryId === root.id}
                    />
                  </ChipRow>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PaymentSourcePickerModal({
  visible,
  paymentSources,
  favoriteIds,
  selectedPaymentSourceId,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly paymentSources: readonly PaymentSource[];
  readonly favoriteIds: readonly string[];
  readonly selectedPaymentSourceId: string | null;
  readonly onSelect: (paymentSourceId: string | null) => void;
  readonly onClose: () => void;
}) {
  const favorites = favoriteIds
    .map((id) => paymentSources.find((source) => source.id === id))
    .filter((source): source is PaymentSource => source !== undefined);
  const others = paymentSources.filter((source) => !favoriteIds.includes(source.id));

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.pickerHeaderRow}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons color={themeTokens.colors.ink} name="close" size={20} />
          </Pressable>
          <View>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              Pagado con
            </Text>
            <Text style={m1TextStyles.secondary}>Para este gasto</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.pickerList}>
          {favorites.length === 0 ? null : (
            <View style={styles.pickerSection}>
              <Text style={styles.pickerSectionLabel}>FAVORITOS</Text>
              {favorites.map((source) => (
                <PaymentSourceRow
                  key={source.id}
                  onPress={() => {
                    onSelect(source.id);
                  }}
                  selected={selectedPaymentSourceId === source.id}
                  source={source}
                />
              ))}
            </View>
          )}
          {others.length === 0 ? null : (
            <View style={styles.pickerSection}>
              <Text style={styles.pickerSectionLabel}>OTROS MEDIOS</Text>
              {others.map((source) => (
                <PaymentSourceRow
                  key={source.id}
                  onPress={() => {
                    onSelect(source.id);
                  }}
                  selected={selectedPaymentSourceId === source.id}
                  source={source}
                />
              ))}
            </View>
          )}
          {paymentSources.length === 0 ? (
            <Text style={m1TextStyles.secondary}>Todavía no hay medios de pago.</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelect(null);
              }}
              style={styles.pickerRow}
            >
              <View
                style={[styles.radio, selectedPaymentSourceId === null && styles.radioSelected]}
              >
                {selectedPaymentSourceId === null ? (
                  <Ionicons color={themeTokens.colors.surface} name="checkmark" size={14} />
                ) : null}
              </View>
              <Text style={m1TextStyles.body}>Sin medio de pago</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PaymentSourceRow({
  source,
  selected,
  onPress,
}: {
  readonly source: PaymentSource;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.pickerRow}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? (
          <Ionicons color={themeTokens.colors.surface} name="checkmark" size={14} />
        ) : null}
      </View>
      <Text style={m1TextStyles.body}>{source.name}</Text>
    </Pressable>
  );
}

function DatePickerModal({
  visible,
  todayLocal,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly todayLocal: string;
  readonly onSelect: (localDate: string) => void;
  readonly onClose: () => void;
}) {
  const [manualDate, setManualDate] = useState('');
  const yesterdayLocal = shiftLocalDate(todayLocal, -1);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            Elegir fecha
          </Text>
          <View style={styles.dateQuickRow}>
            <ActionButton
              label="Hoy"
              onPress={() => {
                onSelect(todayLocal);
              }}
              variant="secondary"
            />
            <ActionButton
              label="Ayer"
              onPress={() => {
                onSelect(yesterdayLocal);
              }}
              variant="secondary"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Otra fecha (aaaa-mm-dd)</Text>
            <TextInput
              accessibilityLabel="Otra fecha"
              onChangeText={setManualDate}
              placeholder="2026-07-15"
              placeholderTextColor={themeTokens.colors.inkSecondary}
              style={styles.textField}
              value={manualDate}
            />
          </View>
          <ActionButton
            disabled={!isValidLocalDateString(manualDate)}
            label="Usar fecha"
            onPress={() => {
              onSelect(manualDate);
            }}
          />
          <ActionButton label="Cancelar" onPress={onClose} variant="secondary" />
        </View>
      </View>
    </Modal>
  );
}

function DiscardConfirmModal({
  visible,
  noun,
  summary,
  onCancel,
  onDiscard,
}: {
  readonly visible: boolean;
  readonly noun: string;
  readonly summary: string;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            ¿Descartar este {noun}?
          </Text>
          <Text style={m1TextStyles.secondary}>
            {summary === '' ? 'Tenés cambios sin guardar.' : `Tenés datos sin guardar: ${summary}.`}{' '}
            Si seguís editando, todo queda como estaba.
          </Text>
          <View style={styles.modalActions}>
            <View style={styles.actionColumn}>
              <ActionButton label="Seguir editando" onPress={onCancel} variant="secondary" />
            </View>
            <View style={styles.actionColumn}>
              <ActionButton label="Descartar" onPress={onDiscard} variant="danger" />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * GAS-03 ("Confirmación de guardado online") / GAS-04 ("Guardado en este teléfono · offline") —
 * per the design's own caption these are "la misma estructura", one view with two states keyed
 * off `saved.outcome`, not two separate screens. Renders full-screen in place of the form (no
 * header, no bottom nav — this route is already a modal-style screen) until the user taps one of
 * the two CTAs below.
 */
function SavedExpenseConfirmation({
  saved,
  categories,
  paymentSources,
  todayLocal,
  otherMemberName,
  onCargarOtro,
  onListo,
}: {
  readonly saved: SavedExpenseSummary;
  readonly categories: readonly Category[];
  readonly paymentSources: readonly PaymentSource[];
  readonly todayLocal: string;
  readonly otherMemberName: string | undefined;
  readonly onCargarOtro: () => void;
  readonly onListo: () => void;
}) {
  const isSynced = saved.outcome === 'created';
  const heading = isSynced ? 'Gasto guardado' : 'Guardado en este teléfono';
  const monthLabel = formatMonthLabel(monthFromLocalDate(saved.localDate))
    .replace(/\s\d{4}$/u, '')
    .toLowerCase();
  const explanation = isSynced
    ? otherMemberName === undefined
      ? `Ya se sincronizó. Los totales de ${monthLabel} se actualizaron.`
      : `${otherMemberName} ya lo puede ver. Los totales de ${monthLabel} se actualizaron.`
    : 'Se va a sincronizar automáticamente cuando vuelva la conexión. No tenés que hacer nada.';

  const category = categories.find((candidate) => candidate.id === saved.categoryId);
  const categoryLabelText = categoryLabel(saved.categoryId, categories) ?? 'Sin categoría';
  const paymentSourceName =
    saved.paymentSourceId === null
      ? undefined
      : paymentSources.find((source) => source.id === saved.paymentSourceId)?.name;
  const dateLabel = formatRecentMovementDateLabel(saved.localDate, todayLocal);
  const subtitle = [categoryLabelText, paymentSourceName, dateLabel]
    .filter((part): part is string => part !== undefined)
    .join(' · ');
  const accentColor = category?.color ?? themeTokens.colors.inkSecondary;
  const initial = saved.description.trim().charAt(0).toUpperCase() || '·';

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.confirmationContent}>
        <View style={styles.confirmationIconCircle}>
          <Ionicons
            color={themeTokens.semanticColors.success.foreground}
            name="checkmark"
            size={32}
          />
        </View>
        <Text accessibilityRole="header" style={styles.confirmationHeading}>
          {heading}
        </Text>

        <View style={[styles.confirmationCard, cardShadowStyle]}>
          <View style={[styles.confirmationAvatar, { backgroundColor: `${accentColor}26` }]}>
            <Text style={[styles.confirmationAvatarText, { color: accentColor }]}>{initial}</Text>
          </View>
          <View style={styles.confirmationReceiptCopy}>
            <Text numberOfLines={1} style={m1TextStyles.body}>
              {saved.description}
            </Text>
            <Text numberOfLines={1} style={m1TextStyles.secondary}>
              {subtitle}
            </Text>
          </View>
          <Text style={styles.confirmationAmount}>{saved.amountDisplay}</Text>
        </View>

        <SyncStatusPill tone={isSynced ? 'synced' : 'pending'} />

        <Text style={styles.confirmationExplanation}>{explanation}</Text>
      </View>

      <View style={styles.footer}>
        <ActionButton label="Cargar otro gasto" onPress={onCargarOtro} />
        <Pressable accessibilityRole="button" onPress={onListo} style={styles.confirmationListo}>
          <Text style={styles.confirmationListoText}>Listo</Text>
        </Pressable>
      </View>
    </SafeAreaView>
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
    justifyContent: 'space-between',
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
  headerTitle: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  currencyToggle: {
    flexDirection: 'row',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surfaceMuted,
    padding: 4,
  },
  currencyOption: {
    minHeight: 32,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
  },
  currencyOptionActive: {
    backgroundColor: themeTokens.colors.surface,
    ...cardShadowStyle,
  },
  currencyOptionText: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  currencyOptionTextActive: {
    color: themeTokens.colors.ink,
  },
  content: {
    flexGrow: 1,
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingBottom: themeTokens.spacing.screen,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: themeTokens.spacing.cardGap,
  },
  amountPrefix: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.cardTitle,
    paddingBottom: 6,
  },
  amountInput: {
    flex: 1,
    // On web, react-native-web renders this as a plain <input>, and the browser's UA default
    // min-content width for a text input scales with fontSize (here 40px) — without an explicit
    // minWidth override, Chrome refuses to shrink the flex item below that intrinsic width
    // (~470px+ at this font size), overflowing `amountRow` and the whole form's ScrollView
    // horizontally. minWidth: 0 lets the flex-basis:0/flex-grow:1 sizing actually apply.
    minWidth: 0,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displayBold,
    fontSize: 40,
    padding: 0,
  },
  fxCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.colors.surface,
    padding: themeTokens.spacing.cardPadding,
  },
  fxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fxCopy: {
    flex: 1,
    gap: 2,
  },
  fxRateInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    paddingHorizontal: 12,
  },
  fxRateInput: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    minWidth: 60,
    textAlign: 'right',
  },
  fxPreview: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    textAlign: 'center',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  seeAll: {
    color: themeTokens.colors.primary,
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
    paddingHorizontal: 14,
  },
  chipSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
  },
  chipText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    maxWidth: 160,
  },
  chipTextSelected: {
    color: themeTokens.colors.surface,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: themeTokens.spacing.cardGap,
  },
  rowColumn: {
    flex: 1,
    minWidth: 150,
    gap: 8,
  },
  field: {
    gap: 8,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
  },
  textField: {
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
  notesField: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addNote: {
    minHeight: 32,
    justifyContent: 'center',
  },
  addNoteText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
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
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.base,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: themeTokens.spacing.screen,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    paddingVertical: 10,
  },
  pickerList: {
    gap: themeTokens.spacing.cardGap,
    padding: themeTokens.spacing.screen,
  },
  pickerRootGroup: {
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
    paddingBottom: themeTokens.spacing.cardGap,
  },
  pickerRootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerAvatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  pickerRootCopy: {
    flex: 1,
    gap: 2,
  },
  pickerSection: {
    gap: 4,
  },
  pickerSectionLabel: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
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
  dateQuickRow: {
    flexDirection: 'row',
    gap: themeTokens.spacing.cardGap,
  },
  confirmationContent: {
    flex: 1,
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.screen * 2,
  },
  confirmationIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeTokens.semanticColors.success.background,
  },
  confirmationHeading: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.hero,
    textAlign: 'center',
  },
  confirmationCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: themeTokens.spacing.cardGap,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.colors.surface,
    padding: themeTokens.spacing.cardPadding,
  },
  confirmationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationAvatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  confirmationReceiptCopy: {
    flex: 1,
    gap: 2,
  },
  confirmationAmount: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  confirmationExplanation: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.body,
    lineHeight: 23,
    textAlign: 'center',
    paddingHorizontal: themeTokens.spacing.cardGap,
  },
  confirmationListo: {
    minHeight: themeTokens.touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationListoText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
    textDecorationLine: 'underline',
  },
});
