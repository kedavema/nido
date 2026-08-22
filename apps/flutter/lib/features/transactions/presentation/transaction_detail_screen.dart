import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/auth/active_household.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/contracts/households.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/money/currency.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/time/year_month.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_screen.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
import '../../../core/widgets/nido_card.dart';
import '../../../core/widgets/screen_header.dart';
import '../../../core/widgets/sync_status_pill.dart';
import '../../categories/application/categories_providers.dart';
import '../../categories/domain/category_appearance.dart';
import '../../categories/domain/category_tree.dart';
import '../../household/presentation/household_home_screen.dart';
import '../../payment_sources/application/payment_sources_providers.dart';
import '../application/transactions_providers.dart';
import '../domain/movement_format.dart';

/// One movement in full, with edit and delete.
class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({super.key, required this.transactionId});

  final String transactionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final householdId = ref.watch(activeHouseholdIdProvider);
    if (householdId == null) {
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }

    final key = (householdId: householdId, transactionId: transactionId);
    final transaction = ref.watch(transactionProvider(key));

    void leave() {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AppRoutes.transactions);
      }
    }

    // FLT-018: titled by what it actually is. The legacy screen said "Detalle
    // del gasto" over every movement, so an income read as an expense on the
    // one screen that shows its sign in full.
    final header = FormHeader(
      title: switch (transaction) {
        AsyncData(value: final value) =>
          value.type == TransactionType.income
              ? 'Detalle del ingreso'
              : 'Detalle del gasto',
        _ => 'Detalle del movimiento',
      },
      subtitle: switch (transaction) {
        AsyncData(value: final value) => formatMonthLabel(
          YearMonth.of(value.localDate),
        ),
        _ => null,
      },
      onDismiss: leave,
      dismissIcon: FormDismissIcon.back,
    );

    return switch (transaction) {
      AsyncData(value: final value) => _DetailBody(
        header: header,
        householdId: householdId,
        transaction: value,
      ),
      AsyncError(error: final error) => AppScreen(
        key: const Key('transaction_detail_screen'),
        header: header,
        children: [
          InlineNotice(
            message: messageForActionError(error),
            tone: NoticeTone.error,
          ),
          ActionButton(
            key: const Key('retry_button'),
            label: 'Reintentar',
            variant: ActionButtonVariant.secondary,
            onPressed: () => ref.invalidate(transactionProvider(key)),
          ),
        ],
      ),
      _ => AppScreen(
        key: const Key('transaction_detail_screen'),
        header: header,
        children: const [LoadingContent(label: 'Cargando movimiento…')],
      ),
    };
  }
}

class _DetailBody extends ConsumerWidget {
  const _DetailBody({
    required this.header,
    required this.householdId,
    required this.transaction,
  });

  final Widget header;
  final String householdId;
  final Transaction transaction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final categories =
        ref.watch(categoriesProvider(householdId)).valueOrNull ??
        const <Category>[];
    final paymentSources =
        ref.watch(paymentSourcesProvider(householdId)).valueOrNull ??
        const <PaymentSource>[];
    final members =
        ref.watch(householdMembersProvider(householdId)).valueOrNull ??
        const <HouseholdMember>[];

    final today = todayInAsuncion(ref.read(clockProvider)());
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

    final paymentSourceName = switch (transaction.paymentSourceId) {
      null => 'Sin medio de pago',
      final id =>
        paymentSources.where((source) => source.id == id).firstOrNull?.name ??
            'Medio de pago archivado',
    };
    final createdByName =
        members
            .where((member) => member.userId == transaction.createdBy)
            .firstOrNull
            ?.displayName ??
        'Alguien';
    final isUsd = transaction.amount.currency == Currency.usd;

    return AppScreen(
      key: const Key('transaction_detail_screen'),
      header: header,
      children: [
        NidoCard(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: categoryTint(accent),
                  child: Text(
                    initial,
                    style: theme.textTheme.titleMedium?.copyWith(color: accent),
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
                        style: theme.textTheme.bodyMedium,
                      ),
                      Text(
                        formatMovementTimestamp(transaction, today),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Text(
              amount.text,
              key: const Key('detail_amount'),
              style: theme.textTheme.displayLarge?.copyWith(
                color: amount.isPositive ? AppColors.success : AppColors.ink,
              ),
            ),
            Text(
              '${transaction.type == TransactionType.income ? 'Ingreso' : 'Gasto'}'
              ' en ${isUsd ? 'dólares' : 'guaraníes'}',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
        NidoCard(
          gap: 0,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionEyebrow('Datos del movimiento'),
            // FLT-018: the real category, for an income too. The legacy screen
            // printed the literal word "Ingreso" here, hiding which income
            // category the movement was filed under — the one thing this row
            // exists to answer.
            _DetailRow(
              label: 'Categoría',
              value:
                  categoryLabel(transaction.categoryId, categories) ??
                  'Categoría no disponible',
            ),
            if (transaction.type == TransactionType.expense)
              _DetailRow(label: 'Pagado con', value: paymentSourceName),
            if (isUsd)
              _DetailRow(
                label: 'Monto original',
                value:
                    'USD ${formatDecimalEs(transaction.amount.toWire(), 2)}'
                    ' · TC Gs. '
                    '${formatDecimalEs(transaction.fxRateToPyg?.toWire() ?? '0', 0)}',
              ),
            _DetailRow(
              label: 'Fecha',
              value: formatFullLocalDate(transaction.localDate),
            ),
            _DetailRow(
              label: 'Cargado por',
              value:
                  '$createdByName · '
                  '${formatOccurredAtTime(transaction.createdAt)}',
            ),
            // Anything that loads here came back from `GET /transactions/:id`,
            // so it is synced by definition; the pill exists so the row reads
            // the same once M4 can show a queued one.
            const _DetailRow(
              label: 'Sincronización',
              trailing: SyncStatusPill(tone: SyncStatusTone.synced),
            ),
            _DetailRow(label: 'Nota', value: transaction.notes ?? '—'),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: ActionButton(
                key: const Key('edit_transaction_button'),
                label: 'Editar',
                variant: ActionButtonVariant.secondary,
                onPressed:
                    () =>
                        context.push(AppRoutes.transactionEdit(transaction.id)),
              ),
            ),
            const SizedBox(width: AppSpacing.cardGap),
            Expanded(
              child: ActionButton(
                key: const Key('delete_transaction_button'),
                label: 'Eliminar',
                variant: ActionButtonVariant.danger,
                onPressed: () => _confirmDelete(context, ref, amount.text),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    String amountText,
  ) async {
    final noun =
        transaction.type == TransactionType.income ? 'ingreso' : 'gasto';
    final deleted = await showDestructiveConfirmDialog(
      context: context,
      title: '¿Eliminar este $noun?',
      message:
          '${transaction.description} · $amountText. Se elimina para los dos '
          'y los totales del mes se recalculan. Esta acción no se puede '
          'deshacer.',
      confirmLabel: 'Eliminar',
      onConfirm:
          () => ref
              .read(transactionsControllerProvider)
              .delete(householdId, transaction.id),
    );
    if (deleted && context.mounted) {
      // Back to wherever the movement was opened from — the list, or a direct
      // link, in which case this is the movements screen.
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AppRoutes.transactions);
      }
    }
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, this.value, this.trailing});

  final String label;
  final String? value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.cardGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: AppSpacing.cardGap),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.bodySmall),
              const SizedBox(width: AppSpacing.cardGap),
              Expanded(
                child:
                    trailing == null
                        ? Text(
                          value!,
                          textAlign: TextAlign.right,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        )
                        : Align(
                          alignment: Alignment.centerRight,
                          child: trailing,
                        ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
