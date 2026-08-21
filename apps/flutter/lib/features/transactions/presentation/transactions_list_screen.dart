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
import '../../../core/time/local_date.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/time/year_month.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
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

    return Scaffold(
      key: const Key('transactions_screen'),
      appBar: AppBar(
        title: const Text('Movimientos'),
        actions: [
          IconButton(
            key: const Key('previous_month_button'),
            tooltip: 'Mes anterior',
            icon: const Icon(Icons.chevron_left),
            onPressed:
                () => ref.read(movementMonthProvider.notifier).previous(),
          ),
          Center(
            child: Text(
              formatMonthLabel(month),
              key: const Key('month_label'),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          IconButton(
            key: const Key('next_month_button'),
            tooltip: 'Mes siguiente',
            icon: const Icon(Icons.chevron_right),
            onPressed: () => ref.read(movementMonthProvider.notifier).next(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('new_transaction_button'),
        onPressed: () => context.push(AppRoutes.transactionNew),
        icon: const Icon(Icons.add),
        label: const Text('Nuevo gasto'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            _SearchAndFilters(
              controller: _search,
              filters: filters,
              categories: categories,
              hasNarrowing: hasNarrowing,
              onClear: () {
                _search.clear();
                ref.read(movementSearchProvider.notifier).clear();
                ref.read(movementFiltersProvider.notifier).clear();
              },
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref
                    ..invalidate(transactionsProvider(listKey))
                    ..invalidate(categoriesProvider(householdId))
                    ..invalidate(paymentSourcesProvider(householdId));
                  await ref.read(transactionsProvider(listKey).future);
                },
                child: switch (transactions) {
                  AsyncData(value: final list) => _DayGroupList(
                    groups: groupTransactionsByDay(
                      applyLocalMovementFilters(list, filters, categories),
                    ),
                    categories: categories,
                    paymentSources: paymentSources,
                    month: month,
                    hasNarrowing: hasNarrowing,
                    today: todayInAsuncion(ref.read(clockProvider)()),
                  ),
                  AsyncError(error: final error) => ListView(
                    padding: AppSpacing.screenPadding,
                    children: [
                      InlineNotice(
                        message: messageForActionError(error),
                        tone: NoticeTone.error,
                      ),
                      const SizedBox(height: AppSpacing.cardGap),
                      OutlinedButton(
                        key: const Key('retry_button'),
                        onPressed:
                            () => ref.invalidate(transactionsProvider(listKey)),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  ),
                  _ => const Center(
                    child: LoadingContent(label: 'Cargando movimientos…'),
                  ),
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchAndFilters extends ConsumerWidget {
  const _SearchAndFilters({
    required this.controller,
    required this.filters,
    required this.categories,
    required this.hasNarrowing,
    required this.onClear,
  });

  final TextEditingController controller;
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
        AppSpacing.sm,
        AppSpacing.screen,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('transactions_search_field'),
            controller: controller,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Buscar comercio, nota o monto…',
            ),
            onChanged: ref.read(movementSearchProvider.notifier).type,
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton.icon(
                key: const Key('open_filters_button'),
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
                icon: const Icon(Icons.tune, size: 18),
                label: Text(
                  filters.activeCount == 0
                      ? 'Filtros'
                      : 'Filtros (${filters.activeCount})',
                ),
              ),
              // The chips are what the button's count refers to, so they
              // share its row: a filter you cannot see is a filter you
              // forget, and then a narrowed list reads as missing data.
              for (final chip in chips)
                InputChip(
                  key: Key('filter_chip_${chip.key.name}'),
                  label: Text(chip.label),
                  deleteIcon: Icon(
                    Icons.close,
                    key: Key('remove_filter_${chip.key.name}'),
                    size: 18,
                  ),
                  deleteButtonTooltipMessage: 'Quitar filtro ${chip.label}',
                  onDeleted:
                      () => ref
                          .read(movementFiltersProvider.notifier)
                          .remove(chip.key),
                ),
              if (hasNarrowing)
                TextButton(
                  key: const Key('clear_filters_button'),
                  onPressed: onClear,
                  child: const Text('Limpiar filtros'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DayGroupList extends StatelessWidget {
  const _DayGroupList({
    required this.groups,
    required this.categories,
    required this.paymentSources,
    required this.month,
    required this.hasNarrowing,
    required this.today,
  });

  final List<DayGroup> groups;
  final List<Category> categories;
  final List<PaymentSource> paymentSources;
  final YearMonth month;
  final bool hasNarrowing;
  final LocalDate today;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (groups.isEmpty) {
      return ListView(
        padding: AppSpacing.screenPadding,
        children: [
          Card(
            key: const Key('transactions_empty_state'),
            child: Padding(
              padding: AppSpacing.cardInsets,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hasNarrowing
                        ? 'Sin resultados'
                        : 'Aún no hay movimientos en '
                            '${formatMonthNameOnly(month)}',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    hasNarrowing
                        ? 'No encontramos movimientos con estos filtros.'
                        : 'Cuando alguno de los dos cargue un gasto o marque '
                            'un ingreso, aparece acá para ambos.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.cardGap,
        AppSpacing.screen,
        // Clears the floating action button.
        88,
      ),
      itemCount: groups.length + 1,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.cardGap),
      itemBuilder: (context, index) {
        if (index == groups.length) {
          return _NoPaginationNotice(month: month);
        }
        final group = groups[index];
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
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: AppColors.inkSecondary,
                    ),
                  ),
                  Text(
                    subtotal.text,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color:
                          subtotal.isPositive
                              ? AppColors.success
                              : AppColors.ink,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.cardPadding,
                ),
                child: Column(
                  children: [
                    for (final transaction in group.transactions)
                      MovementRow(
                        transaction: transaction,
                        categories: categories,
                        paymentSources: paymentSources,
                      ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// The endpoint returns a whole month in one response and has no page
/// parameter. Saying so is the honest alternative to an infinite scroller
/// that silently ends (`docs/flutter-architecture.md` §Performance).
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

/// One movement row, shared by the list and any surface that shows a receipt.
class MovementRow extends StatelessWidget {
  const MovementRow({
    super.key,
    required this.transaction,
    required this.categories,
    required this.paymentSources,
    this.onTap,
  });

  final Transaction transaction;
  final List<Category> categories;
  final List<PaymentSource> paymentSources;
  final VoidCallback? onTap;

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
      if (transaction.amount.currency.wireName == 'USD')
        'USD ${formatDecimalEs(transaction.amount.toWire(), 2)} · '
            'TC ${formatDecimalEs(transaction.fxRateToPyg?.toWire() ?? '0', 0)}',
    ].join(' · ');

    return ListTile(
      key: Key('movement_row_${transaction.id}'),
      onTap:
          onTap ??
          () => context.push(AppRoutes.transactionDetail(transaction.id)),
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        backgroundColor: categoryTint(accent),
        child: Text(
          initial,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: accent,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      title: Text(
        transaction.description,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Text(
        amount.text,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
          color: amount.isPositive ? AppColors.success : AppColors.ink,
        ),
      ),
    );
  }
}
