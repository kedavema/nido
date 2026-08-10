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
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { AppBottomSheet } from '@/components/app-bottom-sheet';
import { categoryTint } from '@/utils/category-appearance';
import { CalendarBoard } from '@/components/date-picker';
import { CategoryPickerSheet } from '@/components/category-picker-sheet';
import {
  AmountField,
  Chip,
  ChipRow,
  formFieldStyles,
  FormSection,
} from '@/components/expense-form-fields';
import {
  ActionButton,
  AppFormScreen,
  AppScreen,
  FormHeader,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  SyncStatusPill,
} from '@/components/m1-ui';
import type { CreateExpenseOutcome } from '@/sync/sync-queue';
import { useSyncQueue } from '@/sync/sync-queue-provider';
import { cardShadowStyle } from '@/theme/styles';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { themeTokens } from '@/theme/tokens';
import {
  nextRequiredCategoryId,
  rootCategoryChips,
  selectedRootCategoryId,
  subcategoryChips,
} from '@/utils/category-selection';
import {
  amountToWireDecimal,
  descriptionForNewTransaction,
  favoritePaymentSourceIds,
  formatAmountDisplay,
  formatFxRateDisplay,
  fxRateToWireDecimal,
  fxRateWireToSanitized,
  localDateToOccurredAt,
  mostRecentUsdRate,
  previewUsdToBasePyg,
  recentRootCategoryIds,
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
  /** Carried through so the confirmation names what was actually saved, not always a gasto. */
  readonly type: TransactionType;
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

function buildDraft(
  original: Transaction | null,
  todayLocal: string,
  initialType: TransactionType = 'EXPENSE',
): Draft {
  if (original === null) {
    return {
      type: initialType,
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
  const { transactionId, type: typeParam } = useLocalSearchParams<{
    transactionId?: string;
    type?: string;
  }>();
  // Only the entry point decides the initial kind, and anything unrecognised falls back to an
  // expense — the overwhelmingly common case, and the behaviour every existing caller already has.
  const initialType: TransactionType = typeParam === 'INCOME' ? 'INCOME' : 'EXPENSE';
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
      const initial = buildDraft(original, todayLocal, initialType);
      setDraft(initial);
      setDirty(false);
      setNotesExpanded(initial.notes !== '');
    } catch (error) {
      setScreenState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, household, transactionId, todayLocal, initialType]);

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

  const selectedRootId = selectedRootCategoryId(draft?.categoryId, categories);

  const kindCategories = useMemo(
    () => categories.filter((category) => category.kind === categoryKind && category.isActive),
    [categories, categoryKind],
  );

  const rootChips = useMemo(
    () => rootCategoryChips(kindCategories, [selectedRootId, ...recentRootIds], 3),
    [kindCategories, recentRootIds, selectedRootId],
  );

  const childChips = useMemo(
    () => subcategoryChips(kindCategories, selectedRootId, draft?.categoryId, 3),
    [kindCategories, selectedRootId, draft?.categoryId],
  );

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
  const title = mode === 'create' ? `Nuevo ${noun}` : `Editar ${noun}`;
  const submitLabel = mode === 'create' ? `Guardar ${noun}` : 'Guardar cambios';

  const canSubmit =
    draft.categoryId !== undefined &&
    // Income has no Comercio field to fill, so it cannot be gated on one. Its description is
    // derived from the category at submit time — see `submit`.
    (isIncome || draft.description.trim() !== '') &&
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
    // Continues in the kind just saved rather than the entry point's: someone who switched to
    // ingreso and saved is far more likely to be loading another ingreso.
    setDraft(buildDraft(null, todayLocal, savedExpense?.type ?? initialType));
    setDirty(false);
    setNotesExpanded(false);
    setSubmitError(undefined);
  }

  function selectCategory(category: Category): void {
    updateDraft({ categoryId: nextRequiredCategoryId(draft?.categoryId, category) });
  }

  function selectPaymentSource(paymentSourceId: string | null): void {
    updateDraft({
      paymentSourceId:
        paymentSourceId !== null && draft?.paymentSourceId === paymentSourceId
          ? null
          : paymentSourceId,
    });
  }

  // Creating from inside the picker: the new category is pushed into the loaded catalog rather
  // than refetched, so the sheet can select it immediately and the draft behind it never moves.
  async function createSubcategory(rootId: string, name: string): Promise<Category> {
    if (household === null || screenState.kind !== 'ready') {
      throw new Error('El catálogo todavía no está listo.');
    }
    const parent = screenState.categories.find((category) => category.id === rootId);
    if (parent === undefined) throw new Error('No encontramos esa categoría raíz.');
    const { category } = await catalog.createCategory(household.id, {
      kind: parent.kind,
      name,
      icon: parent.icon,
      color: parent.color,
      parentId: rootId,
    });
    // Functional update, not a spread of the captured value: two overlapping creations would
    // otherwise both write from the same stale base and the first one would vanish.
    setScreenState((current) =>
      current.kind === 'ready'
        ? { ...current, categories: [...current.categories, category] }
        : current,
    );
    return category;
  }

  // Switching kind clears the category: an expense category is not a legal choice for an income
  // transaction, and leaving a stale one selected would fail on save with nothing on screen to
  // explain why.
  function selectKind(type: TransactionType): void {
    updateDraft({ type, categoryId: undefined });
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

      // An income being *edited* keeps its stored description, since one settled from an expected
      // income carries a real name; only a newly created one is named after its category.
      const categoryName = screenState.categories.find(
        (category) => category.id === draft.categoryId,
      )?.name;
      const createDescription = descriptionForNewTransaction(
        draft.type,
        trimmedDescription,
        categoryName,
      );
      // Income never carries a payment source now that the control is gone. On update the loaded
      // value is passed through untouched rather than nulled, so hiding the control cannot erase
      // something an older income already had.
      const createPaymentSourceId = isIncome ? null : draft.paymentSourceId;

      if (original === null) {
        const request: CreateTransactionRequest = {
          type: draft.type,
          amount: amountWire,
          currency: draft.currency,
          ...(fxRateWire === null ? {} : { fxRateToBase: fxRateWire }),
          occurredAt: draft.occurredAt,
          categoryId: draft.categoryId,
          ...(createPaymentSourceId === null ? {} : { paymentSourceId: createPaymentSourceId }),
          description: createDescription,
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
          type: draft.type,
          description: createDescription,
          categoryId: draft.categoryId,
          paymentSourceId: createPaymentSourceId,
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
      successFeedback();
    } catch (error) {
      errorFeedback();
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
    <>
      <AppFormScreen
        footer={
          <ActionButton
            disabled={!canSubmit}
            label={submitLabel}
            loading={saving}
            onPress={() => void submit()}
          />
        }
        header={<FormHeader onDismiss={handleClose} title={title} />}
      >
        {/*
          Directly above the amount rather than in the header: this toggle is what decides whether
          the number below means money out or money in, so it belongs beside the number it governs.
          Editing does not offer it — an existing transaction's kind is not something to flip.
        */}
        {mode === 'create' ? (
          <View style={styles.kindRow}>
            <KindToggle onSelect={selectKind} selected={draft.type} />
          </View>
        ) : null}
        <AmountField
          accessibilityLabel="Monto"
          autoFocus
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

        <FormSection
          label="Categoría"
          onSeeAll={() => {
            setShowCategoryPicker(true);
          }}
          sublabel={rootChips.length > 0 && selectedRootId !== undefined ? 'recientes' : undefined}
        >
          <ChipRow>
            {rootChips.map((category) => (
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
        </FormSection>

        {childChips.length === 0 ? null : (
          <FormSection label="Subcategoría (opcional)">
            <ChipRow>
              {childChips.map((child) => (
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
          </FormSection>
        )}

        {/* Income asks neither of the expense questions: money was not paid *with* an account, it
            arrived *into* one, and it did not go to a merchant. Category and amount identify it. */}
        {isIncome ? null : (
          <FormSection
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
          </FormSection>
        )}

        <View style={formFieldStyles.field}>
          <Text style={formFieldStyles.fieldLabel}>Fecha</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setShowDatePicker(true);
            }}
            style={({ pressed }) => [
              formFieldStyles.dateField,
              pressed && formFieldStyles.fieldPressed,
            ]}
          >
            <Text numberOfLines={1} style={[m1TextStyles.body, formFieldStyles.dateFieldText]}>
              {draft.localDate === todayLocal ? 'Hoy · ' : ''}
              {formatFullLocalDate(draft.localDate)}
            </Text>
            <Ionicons color={themeTokens.colors.inkSecondary} name="chevron-down" size={16} />
          </Pressable>
        </View>
        {isIncome ? null : (
          <View style={formFieldStyles.field}>
            <Text style={formFieldStyles.fieldLabel}>Comercio</Text>
            <TextInput
              accessibilityLabel="Comercio"
              maxLength={200}
              onChangeText={(description) => {
                updateDraft({ description });
              }}
              placeholder="¿Dónde fue?"
              placeholderTextColor={themeTokens.colors.inkSecondary}
              style={formFieldStyles.textField}
              value={draft.description}
            />
          </View>
        )}

        {notesExpanded ? (
          <View style={formFieldStyles.field}>
            <Text style={formFieldStyles.fieldLabel}>Nota (opcional)</Text>
            <TextInput
              accessibilityLabel="Nota"
              maxLength={2000}
              multiline
              onChangeText={(notes) => {
                updateDraft({ notes });
              }}
              // A multiline input scrolls its own content on Android, which
              // swallows the drag before the form's scroll view ever sees it.
              // The field has no max height, so it can grow instead and leave
              // scrolling to the screen.
              scrollEnabled={false}
              style={[formFieldStyles.textField, styles.notesField]}
              value={draft.notes}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setNotesExpanded(true);
            }}
            style={({ pressed }) => [styles.addNote, pressed && styles.chipPressed]}
          >
            <Text style={styles.addNoteText}>+ Agregar nota (opcional)</Text>
          </Pressable>
        )}

        {submitError === undefined ? null : <InlineNotice tone="error">{submitError}</InlineNotice>}
      </AppFormScreen>

      <CategoryPickerSheet
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
        onCreateSubcategory={createSubcategory}
        selectedCategoryId={draft.categoryId}
        subtitle={`Para este ${noun}`}
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
        value={draft.localDate}
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
    </>
  );
}

function KindToggle({
  selected,
  onSelect,
}: {
  readonly selected: TransactionType;
  readonly onSelect: (type: TransactionType) => void;
}) {
  return (
    <View style={styles.segmented}>
      {(['EXPENSE', 'INCOME'] as const).map((type) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selected === type }}
          key={type}
          onPress={() => {
            onSelect(type);
          }}
          style={({ pressed }) => [
            styles.segmentedOption,
            selected === type && styles.segmentedOptionActive,
            pressed && styles.chipPressed,
          ]}
        >
          <Text
            style={[
              styles.segmentedOptionText,
              selected === type && styles.segmentedOptionTextActive,
            ]}
          >
            {type === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
          </Text>
        </Pressable>
      ))}
    </View>
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
    <AppBottomSheet
      onClose={onClose}
      subtitle="Para este movimiento"
      title="Pagado con"
      visible={visible}
    >
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
          <View style={[styles.radio, selectedPaymentSourceId === null && styles.radioSelected]}>
            {selectedPaymentSourceId === null ? (
              <Ionicons color={themeTokens.colors.surface} name="checkmark" size={14} />
            ) : null}
          </View>
          <Text style={m1TextStyles.body}>Sin medio de pago</Text>
        </Pressable>
      )}
    </AppBottomSheet>
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
  value,
  onSelect,
  onClose,
}: {
  readonly visible: boolean;
  readonly todayLocal: string;
  /** The date currently on the draft, so the calendar opens with it selected. */
  readonly value: string;
  readonly onSelect: (localDate: string) => void;
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const yesterdayLocal = shiftLocalDate(todayLocal, -1);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalSheet, { paddingBottom: themeTokens.spacing.screen + insets.bottom }]}
        >
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
          {visible ? <CalendarBoard onChange={onSelect} value={value} /> : null}
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
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalSheet, { paddingBottom: themeTokens.spacing.screen + insets.bottom }]}
        >
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
  const savedNoun = saved.type === 'INCOME' ? 'Ingreso' : 'Gasto';
  const heading = isSynced ? `${savedNoun} guardado` : 'Guardado en este teléfono';
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
          <View style={[styles.confirmationAvatar, { backgroundColor: categoryTint(accentColor) }]}>
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
        <ActionButton
          label={`Cargar otro ${saved.type === 'INCOME' ? 'ingreso' : 'gasto'}`}
          onPress={onCargarOtro}
        />
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
  // The row the currency toggle used to occupy, now holding the only toggle the form has.
  kindRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  segmented: {
    flexDirection: 'row',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surfaceMuted,
    padding: 4,
  },
  segmentedOption: {
    minHeight: themeTokens.touchTarget.minimum,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
  },
  segmentedOptionActive: {
    backgroundColor: themeTokens.colors.surface,
    ...cardShadowStyle,
  },
  segmentedOptionText: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  segmentedOptionTextActive: {
    color: themeTokens.colors.ink,
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
  chipPressed: {
    opacity: 0.72,
  },
  notesField: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addNote: {
    minHeight: themeTokens.touchTarget.minimum,
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
