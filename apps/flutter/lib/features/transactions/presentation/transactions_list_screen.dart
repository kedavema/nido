import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/auth/active_household.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/money/currency.dart';
import '../../../core/time/local_date.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/time/year_month.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_screen.dart';
import '../../../core/widgets/form_fields.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
import '../../../core/widgets/month_stepper.dart';
import '../../../core/widgets/nido_card.dart';
import '../../../core/widgets/nido_chip.dart';
import '../../../core/widgets/screen_header.dart';
import '../../categories/application/categories_providers.dart';
import '../../categories/domain/category_appearance.dart';
import '../../categories/domain/category_tree.dart';
import '../../payment_sources/application/payment_sources_providers.dart';
import '../application/transactions_providers.dart';
import '../domain/movement_format.dart';
import '../domain/transaction_filters.dart';
import 'movement_filters_sheet.dart';

/// The month's movements: search, kind/category filters, day groups with
/// subtotals, and the entry point for creating one.
class TransactionsListScreen extends ConsumerStatefulWidget {
  const TransactionsListScreen({super.key});

  @override
  ConsumerState<TransactionsListScreen> createState() =>
      _TransactionsListScreenState();
}

class _TransactionsListScreenState
    extends ConsumerState<TransactionsListScreen> {
  final TextEditingController _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(movementSearchProvider).input;
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final householdId = ref.watch(activeHouseholdIdProvider);
    if (householdId == null) {
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }

    final month = ref.watch(movementMonthProvider);
    final filters = ref.watch(movementFiltersProvider);
    final search = ref.watch(movementSearchProvider);
    final categories =
        ref.watch(categoriesProvider(householdId)).valueOrNull ??
        const <Category>[];
    final paymentSources =
        ref.watch(paymentSourcesProvider(householdId)).valueOrNull ??
        const <PaymentSource>[];

    final listKey = (
      householdId: householdId,
      month: month,
      type: filters.type,
      search: search.debounced,
    );
    final transactions = ref.watch(transactionsProvider(listKey));
    final hasNarrowing = filters.activeCount > 0 || search.debounced.isNotEmpty;
    final today = todayInAsuncion(ref.read(clockProvider)());

    Future<void> refresh() async {
      ref
        ..invalidate(transactionsProvider(listKey))
        ..invalidate(categoriesProvider(householdId))
        ..invalidate(paymentSourcesProvider(householdId));
      await ref.read(transactionsProvider(listKey).future);
    }

    final header = _ListHeader(
      controller: _search,
      month: month,
      filters: filters,
      categories: categories,
      hasNarrowing: hasNarrowing,
      onClear: () {
        _search.clear();
        ref.read(movementSearchProvider.notifier).clear();
        ref.read(movementFiltersProvider.notifier).clear();
      },
    );

    final floatingAction = ActionPill(
      key: const Key('new_transaction_button'),
      label: 'Nuevo gasto',
      icon: Icons.add,
      onPressed: () => context.push(AppRoutes.transactionNew),
    );

    return switch (transactions) {
      AsyncData(value: final list) => _loaded(
        header: header,
        floatingAction: floatingAction,
        onRefresh: refresh,
        groups: groupTransactionsByDay(
          applyLocalMovementFilters(list, filters, categories),
        ),
        categories: categories,
        paymentSources: paymentSources,
        month: month,
        today: today,
        hasNarrowing: hasNarrowing,
      ),
      AsyncError(error: final error) => AppScreen(
        key: const Key('transactions_screen'),
        header: header,
        floatingAction: floatingAction,
        children: [
          InlineNotice(
            message: messageForActionError(error),
            tone: NoticeTone.error,
          ),
          ActionButton(
            key: const Key('retry_button'),
            label: 'Reintentar',
            variant: ActionButtonVariant.secondary,
            onPressed: () => ref.invalidate(transactionsProvider(listKey)),
          ),
        ],
      ),
      _ => AppScreen(
        key: const Key('transactions_screen'),
        header: header,
        floatingAction: floatingAction,
        children: const [LoadingContent(label: 'Cargando movimientos…')],
      ),
    };
  }

  Widget _loaded({
    required Widget header,
    required Widget floatingAction,
    required Future<void> Function() onRefresh,
    required List<DayGroup> groups,
    required List<Category> categories,
    required List<PaymentSource> paymentSources,
    required YearMonth month,
    required LocalDate today,
    required bool hasNarrowing,
  }) {
    if (groups.isEmpty) {
      return AppScreen(
        key: const Key('transactions_screen'),
        header: header,
        floatingAction: floatingAction,
        onRefresh: onRefresh,
        children: [_EmptyState(month: month, hasNarrowing: hasNarrowing)],
      );
    }

    return AppListScreen(
      key: const Key('transactions_screen'),
      header: header,
      floatingAction: floatingAction,
      onRefresh: onRefresh,
      // One extra row: the pagination notice closes the list.
      itemCount: groups.length + 1,
      itemBuilder: (context, index) {
        if (index == groups.length) {
          return _NoPaginationNotice(month: month);
        }
        return _DayGroupCard(
          group: groups[index],
          categories: categories,
          paymentSources: paymentSources,
          today: today,
        );
      },
    );
  }
}

/// Title, month stepper, search and the applied filters — pinned above the
/// list so none of it scrolls away mid-search.
class _ListHeader extends ConsumerWidget {
  const _ListHeader({
    required this.controller,
    required this.month,
    required this.filters,
    required this.categories,
    required this.hasNarrowing,
    required this.onClear,
  });

  final TextEditingController controller;
  final YearMonth month;
  final MovementFilters filters;
  final List<Category> categories;
  final bool hasNarrowing;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chips = movementFilterChips(filters, categories);

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.screen,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScreenHeader(
            title: 'Movimientos',
            size: ScreenHeaderSize.compact,
            trailing: MonthStepper(
              label: formatMonthLabel(month),
              onPrevious:
                  () => ref.read(movementMonthProvider.notifier).previous(),
              onNext: () => ref.read(movementMonthProvider.notifier).next(),
            ),
          ),
          const SizedBox(height: AppSpacing.cardGap),
          NidoTextField(
            key: const Key('transactions_search_field'),
            controller: controller,
            hintText: 'Buscar comercio, nota o monto…',
            onChanged: ref.read(movementSearchProvider.notifier).type,
          ),
          const SizedBox(height: AppSpacing.cardGap),
          ChipRow(
            children: [
              SoftChip(
                key: const Key('open_filters_button'),
                label:
                    filters.activeCount == 0
                        ? 'Filtros'
                        : 'Filtros (${filters.activeCount})',
                selected: filters.activeCount > 0,
                onPressed: () async {
                  final applied = await showMovementFiltersSheet(
                    context: context,
                    filters: filters,
                    categories: categories,
                  );
                  if (applied != null) {
                    ref.read(movementFiltersProvider.notifier).apply(applied);
                  }
                },
              ),
              // The chips are what the button's count refers to, so they share
              // its row: a filter you cannot see is a filter you forget, and
              // then a narrowed list reads as missing data.
              for (final chip in chips)
                SoftChip(
                  key: Key('filter_chip_${chip.key.name}'),
                  label: chip.label,
                  selected: true,
                  onPressed:
                      () => ref
                          .read(movementFiltersProvider.notifier)
                          .remove(chip.key),
                  onRemove:
                      () => ref
                          .read(movementFiltersProvider.notifier)
                          .remove(chip.key),
                  removeKey: Key('remove_filter_${chip.key.name}'),
                ),
              if (hasNarrowing)
                TextButton(
                  key: const Key('clear_filters_button'),
                  onPressed: onClear,
                  child: const Text('Limpiar filtros'),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.month, required this.hasNarrowing});

  final YearMonth month;
  final bool hasNarrowing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return NidoCard(
      key: const Key('transactions_empty_state'),
      crossAxisAlignment: CrossAxisAlignment.start,
      gap: AppSpacing.sm,
      children: [
        Text(
          hasNarrowing
              ? 'Sin resultados'
              : 'Aún no hay movimientos en ${formatMonthNameOnly(month)}',
          style: theme.textTheme.titleMedium,
        ),
        Text(
          hasNarrowing
              ? 'No encontramos movimientos con estos filtros.'
              : 'Cuando alguno de los dos cargue un gasto o marque un ingreso, '
                  'aparece acá para ambos.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.inkSecondary,
          ),
        ),
      ],
    );
  }
}

class _DayGroupCard extends StatelessWidget {
  const _DayGroupCard({
    required this.group,
    required this.categories,
    required this.paymentSources,
    required this.today,
  });

  final DayGroup group;
  final List<Category> categories;
  final List<PaymentSource> paymentSources;
  final LocalDate today;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final subtotal = formatSignedPygAmount(group.netBaseAmountPyg);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                formatDayHeading(group.localDate, today),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: AppColors.inkSecondary,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.4,
                ),
              ),
              Text(
                subtotal.text,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color:
                      subtotal.isPositive ? AppColors.success : AppColors.ink,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        NidoCard.single(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.cardPadding,
            vertical: AppSpacing.base,
          ),
          child: Column(
            children: [
              for (var index = 0; index < group.transactions.length; index++)
                MovementRow(
                  transaction: group.transactions[index],
                  categories: categories,
                  paymentSources: paymentSources,
                  showDivider: index < group.transactions.length - 1,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The endpoint returns a whole month in one response and has no page
/// parameter. Saying so is the honest alternative to an infinite scroller that
/// silently ends (`docs/flutter-architecture.md` §Performance).
class _NoPaginationNotice extends StatelessWidget {
  const _NoPaginationNotice({required this.month});

  final YearMonth month;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('no_pagination_notice'),
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Text(
        'Se listan todos los movimientos de ${formatMonthNameOnly(month)}: '
        'este listado no pagina.',
        textAlign: TextAlign.center,
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: AppColors.inkSecondary),
      ),
    );
  }
}

/// One movement row, shared by the list and the save confirmation.
class MovementRow extends StatelessWidget {
  const MovementRow({
    super.key,
    required this.transaction,
    required this.categories,
    required this.paymentSources,
    this.onTap,
    this.showDivider = false,
  });

  final Transaction transaction;
  final List<Category> categories;
  final List<PaymentSource> paymentSources;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final amount = formatTransactionAmount(transaction);
    final category =
        categories
            .where((item) => item.id == transaction.categoryId)
            .firstOrNull;
    final accent =
        category == null
            ? AppColors.inkSecondary
            : categoryColor(category.color);
    final initial =
        transaction.description.trim().isEmpty
            ? '·'
            : transaction.description.trim()[0].toUpperCase();

    final paymentSourceName =
        transaction.paymentSourceId == null
            ? null
            : paymentSources
                .where((source) => source.id == transaction.paymentSourceId)
                .firstOrNull
                ?.name;

    final subtitle = [
      categoryLabel(transaction.categoryId, categories) ?? 'Sin categoría',
      if (paymentSourceName != null) paymentSourceName,
      if (transaction.amount.currency == Currency.usd)
        'USD ${formatDecimalEs(transaction.amount.toWire(), 2)} · '
            'TC ${formatDecimalEs(transaction.fxRateToPyg?.toWire() ?? '0', 0)}',
    ].join(' · ');

    return Column(
      children: [
        InkWell(
          key: Key('movement_row_${transaction.id}'),
          onTap:
              onTap ??
              () => context.push(AppRoutes.transactionDetail(transaction.id)),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: categoryTint(accent),
                  child: Text(
                    initial,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.cardGap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        transaction.description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  amount.text,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color:
                        amount.isPositive ? AppColors.success : AppColors.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (showDivider) const Divider(height: 1, color: AppColors.border),
      ],
    );
  }
}
