import type {
  Category,
  CreateTransactionRequest,
  ListTransactionsQuery,
  PaymentSource,
  Transaction,
  TransactionCurrency,
  TransactionType,
} from '@nido/contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import { categoryTint } from '@/utils/category-appearance';
import {
  ActionButton,
  AppListScreen,
  AppScreen,
  Card,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  PressableScale,
  SyncStatusPill,
} from '@/components/m1-ui';
import { navigateToNewExpense } from '@/navigation/new-expense-route';
import { CREATE_TRANSACTION_MUTATION_TYPE, isCreateTransactionPayload } from '@/sync/sync-queue';
import { useSyncQueue } from '@/sync/sync-queue-provider';
import type { QueuedMutation } from '@/sync/sync-store.types';
import { cardShadowStyle } from '@/theme/styles';
import { themeTokens } from '@/theme/tokens';
import { previewUsdToBasePyg } from '@/utils/expense-form';
import {
  categoryLabel,
  formatDayHeading,
  formatDecimalEs,
  formatMonthLabel,
  formatSignedPygAmount,
  formatTransactionAmount,
  groupTransactionsByDay,
  monthFromLocalDate,
  monthLocalDateRange,
  shiftMonth,
  todayLocalDate,
  type MonthValue,
} from '@/utils/movement-format';

const SEARCH_DEBOUNCE_MILLISECONDS = 400;

interface Filters {
  readonly type?: TransactionType | undefined;
  readonly categoryId?: string | undefined;
  readonly paymentSourceId?: string | undefined;
  readonly currency?: TransactionCurrency | undefined;
}

type FilterKey = keyof Filters;

interface FilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

const TYPE_OPTIONS: readonly FilterOption<TransactionType>[] = [
  { value: 'EXPENSE', label: 'Gastos' },
  { value: 'INCOME', label: 'Ingresos' },
];

const CURRENCY_OPTIONS: readonly FilterOption<TransactionCurrency>[] = [
  { value: 'PYG', label: 'Guaraníes' },
  { value: 'USD', label: 'Dólares' },
];

const EMPTY_CATEGORIES: readonly Category[] = [];
const EMPTY_PAYMENT_SOURCES: readonly PaymentSource[] = [];

type CatalogState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'loaded';
      readonly categories: readonly Category[];
      readonly paymentSources: readonly PaymentSource[];
    };

type TransactionsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'loaded'; readonly transactions: readonly Transaction[] };

export default function MovimientosScreen() {
  const { catalog, state } = useSession();
  const { pending, retry, retryAll, isOnline } = useSyncQueue();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;

  const [month, setMonth] = useState<MonthValue>(() => monthFromLocalDate(todayLocalDate()));
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [expandedFilter, setExpandedFilter] = useState<FilterKey | null>(null);
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: 'loading' });
  const [transactionsState, setTransactionsState] = useState<TransactionsState>({
    kind: 'loading',
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MILLISECONDS);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const loadCatalog = useCallback(
    async (silent = false) => {
      if (household === null) return;
      if (!silent) setCatalogState({ kind: 'loading' });
      try {
        const [{ categories }, { paymentSources }] = await Promise.all([
          catalog.listCategories(household.id),
          catalog.listPaymentSources(household.id),
        ]);
        setCatalogState({ kind: 'loaded', categories, paymentSources });
      } catch (error) {
        setCatalogState({ kind: 'error', message: messageForActionError(error) });
      }
    },
    [catalog, household],
  );

  useEffect(() => {
    queueMicrotask(() => void loadCatalog());
  }, [loadCatalog]);

  const loadTransactions = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (household === null) return;
      if (!silent) setTransactionsState({ kind: 'loading' });
      const { from, to } = monthLocalDateRange(month);
      const query: ListTransactionsQuery = {
        from,
        to,
        ...(filters.type === undefined ? {} : { type: filters.type }),
        ...(filters.categoryId === undefined ? {} : { categoryId: filters.categoryId }),
        ...(filters.paymentSourceId === undefined
          ? {}
          : { paymentSourceId: filters.paymentSourceId }),
        ...(filters.currency === undefined ? {} : { currency: filters.currency }),
        ...(debouncedSearch === '' ? {} : { search: debouncedSearch }),
      };
      try {
        const { transactions } = await catalog.listTransactions(household.id, query);
        if (isActive()) {
          setTransactionsState({ kind: 'loaded', transactions });
        }
      } catch (error) {
        if (isActive()) {
          setTransactionsState({ kind: 'error', message: messageForActionError(error) });
        }
      }
    },
    [catalog, household, month, filters, debouncedSearch],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadTransactions(() => active);
      return () => {
        active = false;
      };
    }, [loadTransactions]),
  );

  // Pull-to-refresh refetches transactions and catalog silently — the RefreshControl spinner is
  // the only progress affordance, so neither reset flips its state back to `loading` (which would
  // swap the visible list for the full-screen skeleton mid-pull).
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([loadTransactions(() => true, true), loadCatalog(true)]).finally(() => {
      setRefreshing(false);
    });
  }, [loadTransactions, loadCatalog]);

  const categories = catalogState.kind === 'loaded' ? catalogState.categories : EMPTY_CATEGORIES;
  const paymentSources =
    catalogState.kind === 'loaded' ? catalogState.paymentSources : EMPTY_PAYMENT_SOURCES;

  const categoryOptions = useMemo<readonly FilterOption<string>[]>(
    () =>
      categories
        .filter((category) => category.isActive)
        .map((category) => ({
          value: category.id,
          label: categoryLabel(category.id, categories) ?? category.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [categories],
  );

  const paymentSourceOptions = useMemo<readonly FilterOption<string>[]>(
    () =>
      paymentSources
        .filter((source) => source.isActive)
        .map((source) => ({ value: source.id, label: source.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [paymentSources],
  );

  // Only mutations this screen knows how to render — a "Pendientes" section, not merged into
  // `dayGroups` (queued items have no server-assigned localDate/baseAmountPyg/id yet).
  const pendingExpenses = useMemo(
    () =>
      pending.filter(
        (mutation) =>
          mutation.type === CREATE_TRANSACTION_MUTATION_TYPE &&
          isCreateTransactionPayload(mutation.payload),
      ),
    [pending],
  );

  function selectFilter<K extends FilterKey>(key: K, value: Filters[K]): void {
    setFilters((current) => ({ ...current, [key]: value }));
    setExpandedFilter(null);
  }

  function toggleFilterOpen(key: FilterKey): void {
    setExpandedFilter((current) => (current === key ? null : key));
  }

  const hasActiveFiltersOrSearch =
    Object.values(filters).some((value) => value !== undefined) || debouncedSearch !== '';

  function clearFilters(): void {
    setFilters({});
    setSearchInput('');
    setDebouncedSearch('');
    setExpandedFilter(null);
  }

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  const dayGroups =
    transactionsState.kind === 'loaded'
      ? groupTransactionsByDay(transactionsState.transactions)
      : [];
  const todayLocal = todayLocalDate();
  const hasDayGroups = dayGroups.length > 0;

  // Fixed above the list: title, month stepper, search, and filter chips. The chips' dropdowns are
  // absolutely positioned; inside a scrolling `ListHeaderComponent` later list cells would paint
  // over them on Android, so this whole block stays pinned via `AppListScreen`'s `header` slot.
  const listHeader = (
    <>
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={styles.title}>
          Movimientos
        </Text>
        <View style={styles.monthPill}>
          <Pressable
            accessibilityLabel="Mes anterior"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setMonth((current) => shiftMonth(current, -1));
            }}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-back" size={16} />
          </Pressable>
          <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
          <Pressable
            accessibilityLabel="Mes siguiente"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setMonth((current) => shiftMonth(current, 1));
            }}
          >
            <Ionicons color={themeTokens.colors.ink} name="chevron-forward" size={16} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Ionicons color={themeTokens.colors.inkSecondary} name="search" size={18} />
        <TextInput
          accessibilityLabel="Buscar comercio, nota o monto"
          onChangeText={setSearchInput}
          placeholder="Buscar comercio, nota o monto…"
          placeholderTextColor={themeTokens.colors.inkSecondary}
          style={styles.searchInput}
          value={searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterPicker
          isOpen={expandedFilter === 'type'}
          label="Tipo"
          onSelect={(value) => {
            selectFilter('type', value);
          }}
          onToggleOpen={() => {
            toggleFilterOpen('type');
          }}
          options={TYPE_OPTIONS}
          selected={filters.type}
        />
        <FilterPicker
          isOpen={expandedFilter === 'categoryId'}
          label="Categoría"
          onSelect={(value) => {
            selectFilter('categoryId', value);
          }}
          onToggleOpen={() => {
            toggleFilterOpen('categoryId');
          }}
          options={categoryOptions}
          selected={filters.categoryId}
        />
        <FilterPicker
          isOpen={expandedFilter === 'paymentSourceId'}
          label="Medio de pago"
          onSelect={(value) => {
            selectFilter('paymentSourceId', value);
          }}
          onToggleOpen={() => {
            toggleFilterOpen('paymentSourceId');
          }}
          options={paymentSourceOptions}
          selected={filters.paymentSourceId}
        />
        <FilterPicker
          isOpen={expandedFilter === 'currency'}
          label="Moneda"
          onSelect={(value) => {
            selectFilter('currency', value);
          }}
          onToggleOpen={() => {
            toggleFilterOpen('currency');
          }}
          options={CURRENCY_OPTIONS}
          selected={filters.currency}
        />
      </View>

      {hasActiveFiltersOrSearch ? (
        <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearFilters}>
          <Text style={styles.clearFiltersText}>Limpiar filtros</Text>
        </Pressable>
      ) : null}
    </>
  );

  // Scrolls with the list: connection banner, load progress/errors, and the offline "Pendientes"
  // card. Sits above the day groups; `hasDayGroups` adds the gap before the first group.
  const scrollHeader = (
    <View style={[styles.scrollHeader, hasDayGroups && styles.scrollHeaderSpaced]}>
      {isOnline || pendingExpenses.length === 0 ? null : (
        <View accessibilityLiveRegion="polite" style={styles.offlineBanner}>
          <View style={styles.offlineBannerDot} />
          <Text style={styles.offlineBannerText}>
            Sin conexión ·{' '}
            {pendingExpenses.length === 1
              ? '1 movimiento esperando sincronizar'
              : `${pendingExpenses.length.toString()} movimientos esperando sincronizar`}
          </Text>
        </View>
      )}

      {transactionsState.kind === 'loading' || catalogState.kind === 'loading' ? (
        <LoadingContent label="Cargando movimientos…" />
      ) : null}

      {transactionsState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{transactionsState.message}</InlineNotice>
          <ActionButton
            label="Reintentar"
            onPress={() => void loadTransactions(() => true)}
            variant="secondary"
          />
        </>
      ) : null}

      {catalogState.kind === 'error' ? (
        <InlineNotice tone="error">{catalogState.message}</InlineNotice>
      ) : null}

      {pendingExpenses.length === 0 ? null : (
        <Card>
          <View style={styles.pendingHeaderRow}>
            <View style={styles.pendingHeaderCopy}>
              <Text style={m1TextStyles.sectionTitle}>Pendientes</Text>
              <Text style={m1TextStyles.secondary}>
                {pendingExpenses.length === 1
                  ? '1 movimiento guardado en este teléfono.'
                  : `${pendingExpenses.length.toString()} movimientos guardados en este teléfono.`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retryAll()}
              style={styles.pendingRetryAll}
            >
              <Text style={styles.pendingRetryAllText}>Reintentar todo</Text>
            </Pressable>
          </View>
          {pendingExpenses.map((mutation, index) => (
            <PendingMutationRow
              categories={categories}
              isLast={index === pendingExpenses.length - 1}
              key={mutation.id}
              mutation={mutation}
              onRetry={() => void retry(mutation.id)}
            />
          ))}
        </Card>
      )}
    </View>
  );

  // Only a *loaded* empty month is a real empty state — while loading, `dayGroups` is also empty but
  // the spinner in `scrollHeader` covers it, so render nothing here to avoid a flash of empty copy.
  const listEmpty =
    transactionsState.kind === 'loaded' ? (
      hasActiveFiltersOrSearch ? (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>Sin resultados</Text>
          <Text style={m1TextStyles.secondary}>No encontramos movimientos con estos filtros.</Text>
          <ActionButton label="Limpiar filtros" onPress={clearFilters} variant="secondary" />
        </Card>
      ) : (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>
            Aún no hay movimientos en {formatMonthLabel(month).toLowerCase()}
          </Text>
          <Text style={m1TextStyles.secondary}>
            Cuando alguno de los dos cargue un gasto o marque un ingreso, aparece acá para ambos.
          </Text>
          <ActionButton
            label="Cargar un gasto"
            onPress={() => {
              navigateToNewExpense();
            }}
          />
        </Card>
      )
    ) : null;

  return (
    <AppListScreen
      data={dayGroups}
      floatingAction={
        <PressableScale
          accessibilityLabel="Nuevo gasto"
          haptic
          onPress={() => {
            navigateToNewExpense();
          }}
          style={styles.fab}
        >
          <Text style={styles.fabLabel}>+ Nuevo gasto</Text>
        </PressableScale>
      }
      header={listHeader}
      ItemSeparatorComponent={DayGroupSeparator}
      keyExtractor={(group) => group.localDate}
      ListEmptyComponent={listEmpty}
      ListHeaderComponent={scrollHeader}
      onRefresh={onRefresh}
      refreshing={refreshing}
      renderItem={({ item: group }) => {
        const subtotal = formatSignedPygAmount(group.netBaseAmountPyg);
        return (
          <View style={styles.dayGroup}>
            <View style={styles.dayHeaderRow}>
              <Text style={styles.dayHeading}>{formatDayHeading(group.localDate, todayLocal)}</Text>
              <Text
                style={[
                  styles.daySubtotal,
                  subtotal.isPositive ? styles.positiveAmount : styles.negativeAmount,
                ]}
              >
                {subtotal.text}
              </Text>
            </View>
            <Card>
              {group.transactions.map((transaction, index) => (
                <MovementRow
                  category={categories.find((c) => c.id === transaction.categoryId)}
                  categoryLabelText={categoryLabel(transaction.categoryId, categories)}
                  isLast={index === group.transactions.length - 1}
                  key={transaction.id}
                  onPress={() => {
                    router.push(`/movimiento/${transaction.id}`);
                  }}
                  paymentSourceName={
                    transaction.paymentSourceId === null
                      ? undefined
                      : paymentSources.find((s) => s.id === transaction.paymentSourceId)?.name
                  }
                  transaction={transaction}
                />
              ))}
            </Card>
          </View>
        );
      }}
    />
  );
}

/** Vertical gap between day-group cards in the Movimientos list. */
function DayGroupSeparator() {
  return <View style={styles.dayGroupSeparator} />;
}

function FilterPicker<T extends string>({
  label,
  options,
  selected,
  isOpen,
  onToggleOpen,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly FilterOption<T>[];
  readonly selected: T | undefined;
  readonly isOpen: boolean;
  readonly onToggleOpen: () => void;
  readonly onSelect: (value: T | undefined) => void;
}) {
  const activeOption = options.find((option) => option.value === selected);

  return (
    <View style={styles.filterColumn}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (activeOption !== undefined) {
            onSelect(undefined);
          } else {
            onToggleOpen();
          }
        }}
        style={[styles.chip, activeOption !== undefined && styles.activeChip]}
      >
        <Text
          numberOfLines={1}
          style={[styles.chipText, activeOption !== undefined && styles.activeChipText]}
        >
          {activeOption?.label ?? label}
        </Text>
        <Ionicons
          color={
            activeOption !== undefined
              ? themeTokens.colors.surface
              : themeTokens.colors.inkSecondary
          }
          name={activeOption !== undefined ? 'close' : 'chevron-down'}
          size={14}
        />
      </Pressable>
      {isOpen ? (
        <View style={[styles.optionsPanel, cardShadowStyle]}>
          {options.length === 0 ? (
            <Text style={styles.optionEmpty}>No hay opciones disponibles.</Text>
          ) : (
            options.map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                onPress={() => {
                  onSelect(option.value);
                }}
                style={styles.optionRow}
              >
                <Text style={m1TextStyles.body}>{option.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function MovementRow({
  transaction,
  category,
  categoryLabelText,
  paymentSourceName,
  isLast,
  onPress,
}: {
  readonly transaction: Transaction;
  readonly category: Category | undefined;
  readonly categoryLabelText: string | undefined;
  readonly paymentSourceName: string | undefined;
  readonly isLast: boolean;
  readonly onPress: () => void;
}) {
  const amount = formatTransactionAmount(transaction);
  const initial = transaction.description.trim().charAt(0).toUpperCase() || '·';
  const accentColor = category?.color ?? themeTokens.colors.inkSecondary;

  const subtitleParts = [categoryLabelText ?? 'Sin categoría'];
  if (paymentSourceName !== undefined) {
    subtitleParts.push(paymentSourceName);
  }
  if (transaction.currency === 'USD') {
    subtitleParts.push(
      `USD ${formatDecimalEs(transaction.amount, 2)} · TC ${formatDecimalEs(transaction.fxRateToBase ?? '0', 0)}`,
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.movementRow, !isLast && styles.movementRowDivider]}
    >
      <View style={[styles.avatar, { backgroundColor: categoryTint(accentColor) }]}>
        <Text style={[styles.avatarText, { color: accentColor }]}>{initial}</Text>
      </View>
      <View style={styles.movementCopy}>
        <Text numberOfLines={1} style={m1TextStyles.body}>
          {transaction.description}
        </Text>
        <Text numberOfLines={1} style={m1TextStyles.secondary}>
          {subtitleParts.join(' · ')}
        </Text>
      </View>
      <Text
        style={[
          styles.movementAmount,
          amount.isPositive ? styles.positiveAmount : styles.negativeAmount,
        ]}
      >
        {amount.text}
      </Text>
    </Pressable>
  );
}

/**
 * PYG-equivalent amount for a still-queued expense, formatted like a day-group subtotal (reuses
 * `formatSignedPygAmount`). The queued request's own `amount` is already PYG-scale for PYG
 * expenses; for USD it's only a client-side estimate (`previewUsdToBasePyg`) since the
 * server-computed `baseAmountPyg` doesn't exist yet for an unsynced mutation.
 */
function formatQueuedExpenseAmount(request: CreateTransactionRequest): {
  readonly text: string;
  readonly isPositive: boolean;
} {
  const baseAmountPyg =
    request.currency === 'PYG'
      ? request.amount
      : previewUsdToBasePyg(request.amount, request.fxRateToBase ?? '0');
  return formatSignedPygAmount(-BigInt(baseAmountPyg));
}

function PendingMutationRow({
  mutation,
  categories,
  isLast,
  onRetry,
}: {
  readonly mutation: QueuedMutation;
  readonly categories: readonly Category[];
  readonly isLast: boolean;
  readonly onRetry: () => void;
}) {
  if (!isCreateTransactionPayload(mutation.payload)) {
    return null;
  }

  const { request } = mutation.payload;
  const amount = formatQueuedExpenseAmount(request);
  const categoryLabelText = categoryLabel(request.categoryId, categories) ?? 'Sin categoría';
  const statusIconName =
    mutation.status === 'syncing'
      ? 'sync'
      : mutation.status === 'error'
        ? 'alert-circle'
        : 'time-outline';

  const row = (
    <View style={[styles.movementRow, !isLast && styles.movementRowDivider]}>
      <View style={[styles.avatar, styles.pendingAvatar]}>
        <Ionicons color={themeTokens.colors.inkSecondary} name={statusIconName} size={18} />
      </View>
      <View style={styles.movementCopy}>
        <Text numberOfLines={1} style={m1TextStyles.body}>
          {request.description}
        </Text>
        <Text numberOfLines={1} style={m1TextStyles.secondary}>
          {categoryLabelText}
        </Text>
        {mutation.status === 'syncing' ? (
          <Text style={m1TextStyles.secondary}>Sincronizando…</Text>
        ) : (
          <SyncStatusPill tone={mutation.status === 'error' ? 'error' : 'pending'} />
        )}
      </View>
      <Text style={[styles.movementAmount, styles.negativeAmount]}>{amount.text}</Text>
    </View>
  );

  if (mutation.status !== 'error') {
    return row;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onRetry}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.base,
  },
  title: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.displaySemibold,
    fontSize: themeTokens.typography.scale.screenTitle,
    lineHeight: 26,
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  monthLabel: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: themeTokens.spacing.screen,
    marginTop: themeTokens.spacing.cardGap,
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: themeTokens.spacing.screen,
    marginTop: themeTokens.spacing.cardGap,
  },
  filterColumn: {
    position: 'relative',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: themeTokens.touchTarget.minimum,
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.surface,
    paddingHorizontal: 14,
  },
  activeChip: {
    borderColor: themeTokens.colors.primary,
    backgroundColor: themeTokens.colors.primary,
  },
  chipText: {
    color: themeTokens.colors.ink,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    maxWidth: 140,
  },
  activeChipText: {
    color: themeTokens.colors.surface,
  },
  optionsPanel: {
    position: 'absolute',
    top: themeTokens.touchTarget.minimum + 6,
    left: 0,
    zIndex: 10,
    minWidth: 200,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.radii.card,
    backgroundColor: themeTokens.colors.surface,
    paddingVertical: 4,
  },
  optionRow: {
    minHeight: themeTokens.touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  optionEmpty: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodyRegular,
    fontSize: themeTokens.typography.scale.secondary,
    padding: 16,
  },
  clearFilters: {
    alignSelf: 'flex-start',
    marginHorizontal: themeTokens.spacing.screen,
    marginTop: 10,
    minHeight: 32,
    justifyContent: 'center',
  },
  clearFiltersText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    textDecorationLine: 'underline',
  },
  scrollHeader: {
    gap: themeTokens.spacing.cardGap,
  },
  scrollHeaderSpaced: {
    marginBottom: themeTokens.spacing.cardGap,
  },
  dayGroup: {
    gap: 8,
  },
  dayGroupSeparator: {
    height: themeTokens.spacing.cardGap,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dayHeading: {
    color: themeTokens.colors.inkSecondary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.label,
    letterSpacing: 0.4,
  },
  daySubtotal: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: themeTokens.touchTarget.minimum,
    paddingVertical: 10,
  },
  movementRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  pendingAvatar: {
    backgroundColor: themeTokens.colors.surfaceMuted,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  pendingHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  pendingRetryAll: {
    minHeight: 32,
    justifyContent: 'center',
  },
  pendingRetryAllText: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
    textDecorationLine: 'underline',
  },
  movementCopy: {
    flex: 1,
    gap: 2,
  },
  movementAmount: {
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
  positiveAmount: {
    color: themeTokens.semanticColors.success.foreground,
  },
  negativeAmount: {
    color: themeTokens.colors.ink,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: themeTokens.radii.button,
    backgroundColor: themeTokens.colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  offlineBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: themeTokens.colors.surface,
  },
  offlineBannerText: {
    flex: 1,
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.secondary,
  },
  fab: {
    minHeight: themeTokens.touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
    backgroundColor: themeTokens.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    ...cardShadowStyle,
  },
  fabLabel: {
    color: themeTokens.colors.surface,
    fontFamily: themeTokens.typography.families.bodySemibold,
    fontSize: themeTokens.typography.scale.body,
  },
});
