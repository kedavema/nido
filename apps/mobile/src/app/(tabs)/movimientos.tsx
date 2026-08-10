import type {
  Category,
  CreateTransactionRequest,
  ListTransactionsQuery,
  PaymentSource,
  Transaction,
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
  ScreenHeader,
  AppScreen,
  Card,
  InlineNotice,
  LoadingContent,
  m1TextStyles,
  PressableScale,
  SyncStatusPill,
} from '@/components/m1-ui';
import { navigateToNewExpense } from '@/navigation/new-expense-route';
import { MonthStepper } from '@/components/month-stepper';
import { CREATE_TRANSACTION_MUTATION_TYPE, isCreateTransactionPayload } from '@/sync/sync-queue';
import { useSyncQueue } from '@/sync/sync-queue-provider';
import type { QueuedMutation } from '@/sync/sync-store.types';
import {
  ActiveFilterChips,
  FiltersButton,
  MovementFiltersSheet,
} from '@/components/movement-filters-sheet';
import {
  activeFilterCount,
  applyLocalMovementFilters,
  movementFilterChips,
  type MovementFilters,
} from '@/utils/movement-filters';
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
  const [filters, setFilters] = useState<MovementFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // `filters.type`, not `filters`: the category is resolved locally, so depending on the whole
  // object made picking one recreate this callback, re-fire the focus effect and refetch a query
  // that had not changed — blanking the list to its loading state, and on a failed refetch
  // replacing perfectly good local data with an error banner.
  const filterType = filters.type;
  const loadTransactions = useCallback(
    async (isActive: () => boolean, silent = false) => {
      if (household === null) return;
      if (!silent) setTransactionsState({ kind: 'loading' });
      const { from, to } = monthLocalDateRange(month);
      const query: ListTransactionsQuery = {
        from,
        to,
        ...(filterType === undefined ? {} : { type: filterType }),
        // No `categoryId`: selecting a root has to include its subcategories, and the API matches
        // the id exactly. Applied over the response instead — see `applyLocalMovementFilters`.
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
    [catalog, household, month, filterType, debouncedSearch],
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

  const filterChips = useMemo(
    () => movementFilterChips(filters, categories),
    [filters, categories],
  );

  // The category filter is resolved here rather than by the API, because picking a root has to
  // include its subcategories and the endpoint matches the id exactly. Safe to do locally while a
  // month arrives in one unpaginated response — the screen already holds every row it could match.
  // Memoised because it is a full pass plus a sort over that month, and this screen re-renders on
  // every keystroke of the search box, long before the debounce fires.
  const dayGroups = useMemo(
    () =>
      transactionsState.kind === 'loaded'
        ? groupTransactionsByDay(
            applyLocalMovementFilters(transactionsState.transactions, filters, categories),
          )
        : [],
    [transactionsState, filters, categories],
  );

  const filterCount = activeFilterCount(filters);
  const hasActiveFiltersOrSearch = filterCount > 0 || debouncedSearch !== '';

  function clearFilters(): void {
    setFilters({});
    setSearchInput('');
    setDebouncedSearch('');
  }

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }

  const todayLocal = todayLocalDate();
  const hasDayGroups = dayGroups.length > 0;

  // Fixed above the list via `AppListScreen`'s `header` slot: title, month stepper, search, the
  // Filtros button and the applied-filter chips. Nothing here overlays the list any more — the
  // filters open in a modal — but the month stepper and the active filters have to stay reachable
  // without scrolling back up, which is what the pinned slot is for.
  const listHeader = (
    <>
      <View style={styles.headerBlock}>
        <ScreenHeader
          size="compact"
          title="Movimientos"
          trailing={
            <MonthStepper
              label={formatMonthLabel(month)}
              onNext={() => {
                setMonth((current) => shiftMonth(current, 1));
              }}
              onPrevious={() => {
                setMonth((current) => shiftMonth(current, -1));
              }}
            />
          }
        />
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
        <FiltersButton
          count={filterCount}
          onPress={() => {
            setFiltersOpen(true);
          }}
        />
      </View>

      <ActiveFilterChips
        chips={filterChips}
        onRemove={(key) => {
          setFilters((current) => ({ ...current, [key]: undefined }));
        }}
      />

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
    <>
      <MovementFiltersSheet
        categories={categories}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
        }}
        onClose={() => {
          setFiltersOpen(false);
        }}
        visible={filtersOpen}
      />
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
                <Text style={styles.dayHeading}>
                  {formatDayHeading(group.localDate, todayLocal)}
                </Text>
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
    </>
  );
}

/** Vertical gap between day-group cards in the Movimientos list. */
function DayGroupSeparator() {
  return <View style={styles.dayGroupSeparator} />;
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
  // #6: this used spacing.base — four pixels above the title, where every comparable surface
  // uses screen. The block keeps its own padding because it is pinned outside the scroll view,
  // which is what supplies it everywhere else.
  headerBlock: {
    paddingHorizontal: themeTokens.spacing.screen,
    paddingTop: themeTokens.spacing.screen,
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
