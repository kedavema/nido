import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_radii.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/auth/active_household.dart';
import '../../../core/contracts/categories.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/contracts/transactions.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/ids/uuid_v4.dart';
import '../../../core/money/currency.dart';
import '../../../core/time/local_date.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/amount_field.dart';
import '../../../core/widgets/app_screen.dart';
import '../../../core/widgets/form_fields.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
import '../../../core/widgets/nido_card.dart';
import '../../../core/widgets/nido_chip.dart';
import '../../../core/widgets/screen_header.dart';
import '../../../core/widgets/sync_status_pill.dart';
import '../../categories/application/categories_providers.dart';
import '../../categories/domain/category_tree.dart';
import '../../payment_sources/application/payment_sources_providers.dart';
import '../application/transactions_providers.dart';
import '../domain/amount_input.dart';
import '../domain/movement_format.dart';
import '../domain/transaction_draft.dart';
import 'category_picker_sheet.dart';
import 'local_date_picker_sheet.dart';
import 'payment_source_picker_sheet.dart';
import 'transactions_list_screen.dart';

/// The new/edit movement form.
///
/// One screen for both, as in the legacy app: the fields are identical and the
/// only differences are the title, whether the kind toggle is offered (an
/// existing movement's kind is not something to flip — see
/// [TransactionDraft.toUpdateRequest]) and what happens on save.
class TransactionFormScreen extends ConsumerStatefulWidget {
  const TransactionFormScreen({
    super.key,
    this.transactionId,
    this.initialType = TransactionType.expense,
  });

  /// `null` creates; an id edits that movement.
  final String? transactionId;

  /// Only the entry point decides the initial kind, and anything unrecognised
  /// is an expense — the common case and every caller's default.
  final TransactionType initialType;

  @override
  ConsumerState<TransactionFormScreen> createState() =>
      _TransactionFormScreenState();
}

class _TransactionFormScreenState extends ConsumerState<TransactionFormScreen> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _fxRate = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _notes = TextEditingController();

  TransactionDraft? _draft;
  bool _dirty = false;
  bool _saving = false;
  bool _notesExpanded = false;
  String? _submitError;
  Transaction? _saved;

  bool get _isEdit => widget.transactionId != null;

  @override
  void dispose() {
    _amount.dispose();
    _fxRate.dispose();
    _description.dispose();
    _notes.dispose();
    super.dispose();
  }

  LocalDate get _todayLocal => todayInAsuncion(ref.read(clockProvider)());

  DateTime Function() get _now => ref.read(clockProvider);

  void _update(TransactionDraft next) {
    setState(() {
      _draft = next;
      _dirty = true;
    });
  }

  /// Keeps a controller showing the formatted value without moving the caret
  /// away from the end — the field is numeric and always appended to.
  void _syncController(TextEditingController controller, String value) {
    if (controller.text == value) {
      return;
    }
    controller.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
  }

  void _seedDraft(TransactionDraft draft) {
    _draft = draft;
    _amount.text = draft.amount.display;
    _fxRate.text = draft.fxRate.display;
    _description.text = draft.description;
    _notes.text = draft.notes;
    _notesExpanded = draft.notes.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final householdId = ref.watch(activeHouseholdIdProvider);
    if (householdId == null) {
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }

    final categories = ref.watch(categoriesProvider(householdId));
    final paymentSources = ref.watch(paymentSourcesProvider(householdId));
    final history = ref.watch(allTransactionsProvider(householdId));
    final original =
        _isEdit
            ? ref.watch(
              transactionProvider((
                householdId: householdId,
                transactionId: widget.transactionId!,
              )),
            )
            : const AsyncValue<Transaction?>.data(null);

    final error =
        categories.error ??
        paymentSources.error ??
        history.error ??
        original.error;
    if (error != null) {
      return _errorScreen(householdId, error);
    }

    if (!categories.hasValue ||
        !paymentSources.hasValue ||
        !history.hasValue ||
        !original.hasValue) {
      return const AppScreen(children: [LoadingContent(label: 'Cargando…')]);
    }

    // Seeded once, from the loaded data. Assigning here rather than from a
    // listener keeps it a pure function of what arrived, and the null check
    // makes it happen exactly once per screen.
    if (_draft == null) {
      final loaded = original.value;
      _seedDraft(
        loaded == null
            ? TransactionDraft.blank(
              todayLocal: _todayLocal,
              now: _now,
              type: widget.initialType,
            )
            : TransactionDraft.fromTransaction(loaded),
      );
    }

    final saved = _saved;
    if (saved != null) {
      return _SavedConfirmation(
        transaction: saved,
        categories: categories.value!,
        paymentSources: paymentSources.value!,
        today: _todayLocal,
        onAnother: _startAnother,
        onDone: _leave,
      );
    }

    return _form(
      householdId: householdId,
      categories: categories.value!,
      paymentSources: paymentSources.value!,
      history: history.value!,
    );
  }

  Widget _errorScreen(String householdId, Object error) {
    return AppScreen(
      header: FormHeader(
        title: 'Movimiento',
        onDismiss: _leave,
        dismissIcon: FormDismissIcon.back,
      ),
      children: [
        InlineNotice(
          message: messageForActionError(error),
          tone: NoticeTone.error,
        ),
        ActionButton(
          key: const Key('retry_button'),
          label: 'Reintentar',
          variant: ActionButtonVariant.secondary,
          onPressed: () {
            ref
              ..invalidate(categoriesProvider(householdId))
              ..invalidate(paymentSourcesProvider(householdId))
              ..invalidate(allTransactionsProvider(householdId));
            if (widget.transactionId case final id?) {
              ref.invalidate(
                transactionProvider((
                  householdId: householdId,
                  transactionId: id,
                )),
              );
            }
          },
        ),
      ],
    );
  }

  void _leave() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.transactions);
    }
  }

  /// "Cargar otro" resets to a blank draft and stays on this route.
  void _startAnother() {
    setState(() {
      _submitError = null;
      _dirty = false;
      _saved = null;
      _seedDraft(
        TransactionDraft.blank(
          todayLocal: _todayLocal,
          now: _now,
          // Continues in the kind just saved rather than the entry point's:
          // someone who switched to ingreso is likely loading another.
          type: _draft?.type ?? widget.initialType,
        ),
      );
    });
  }

  Future<bool> _confirmDiscard() async {
    final draft = _draft;
    final summary = [
      if (draft != null && !draft.amount.isEmpty)
        '${draft.currency == Currency.pyg ? 'Gs.' : 'USD'} '
            '${draft.amount.display}',
      if (draft != null && draft.description.trim().isNotEmpty)
        draft.description.trim(),
    ].join(' · ');
    final noun = (_draft?.isIncome ?? false) ? 'ingreso' : 'gasto';

    final discard = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0x8C141C19),
      builder: (context) {
        final theme = Theme.of(context);
        final bottomInset = MediaQuery.viewPaddingOf(context).bottom;

        return Container(
          key: const Key('discard_dialog'),
          width: double.infinity,
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(AppRadii.modal),
              topRight: Radius.circular(AppRadii.modal),
            ),
          ),
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.lg,
            AppSpacing.screen,
            AppSpacing.screen + bottomInset,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '¿Descartar este $noun?',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                summary.isEmpty
                    ? 'Tenés cambios sin guardar. Si seguís editando, todo '
                        'queda como estaba.'
                    : 'Tenés datos sin guardar: $summary. Si seguís editando, '
                        'todo queda como estaba.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  Expanded(
                    child: ActionButton(
                      key: const Key('keep_editing_button'),
                      label: 'Seguir editando',
                      variant: ActionButtonVariant.secondary,
                      onPressed: () => Navigator.of(context).pop(false),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.cardGap),
                  Expanded(
                    child: ActionButton(
                      key: const Key('discard_button'),
                      label: 'Descartar',
                      variant: ActionButtonVariant.danger,
                      onPressed: () => Navigator.of(context).pop(true),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    return discard ?? false;
  }

  Future<void> _submit(String householdId, List<Category> categories) async {
    final draft = _draft;
    if (draft == null || !draft.isSubmittable) {
      return;
    }
    setState(() {
      _saving = true;
      _submitError = null;
    });

    try {
      final controller = ref.read(transactionsControllerProvider);
      if (widget.transactionId case final id?) {
        await controller.update(householdId, id, draft.toUpdateRequest());
        if (mounted) {
          setState(() {
            _saving = false;
            _dirty = false;
          });
          _leave();
        }
        return;
      }

      final created = await controller.create(
        householdId,
        draft.toCreateRequest(
          categories: categories,
          clientMutationId: ref.read(idGeneratorProvider)(),
        ),
      );
      if (mounted) {
        setState(() {
          _saving = false;
          _dirty = false;
          _saved = created;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _submitError = messageForActionError(error);
        });
      }
    }
  }

  Widget _form({
    required String householdId,
    required List<Category> categories,
    required List<PaymentSource> paymentSources,
    required List<Transaction> history,
  }) {
    final theme = Theme.of(context);
    final draft = _draft!;
    final kind = draft.isIncome ? CategoryKind.income : CategoryKind.expense;
    final kindCategories = categories
        .where((category) => category.kind == kind && category.isActive)
        .toList(growable: false);

    final recentRoots = recentRootCategoryIds(
      transactions: history,
      categories: categories,
      kind: kind,
      todayLocal: _todayLocal,
    );
    final selectedRootId = selectedRootCategoryId(draft.categoryId, categories);
    final rootChips = rootCategoryChips(
      kindCategories,
      recentRootIds: recentRoots,
      selectedRootId: selectedRootId,
      limit: quickChipLimit,
    );
    final childChips = subcategoryChips(
      kindCategories,
      selectedRootId,
      draft.categoryId,
      quickChipLimit,
    );

    final favoriteIds = favoritePaymentSourceIds(
      transactions: history,
      activePaymentSourceIds: {
        for (final source in paymentSources)
          if (source.isActive) source.id,
      },
    );
    final sourceChips = paymentSourceChips(
      paymentSources: paymentSources,
      favoriteIds: favoriteIds,
      selectedId: draft.paymentSourceId,
    );

    final noun = draft.isIncome ? 'ingreso' : 'gasto';

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) {
          return;
        }
        if (await _confirmDiscard() && mounted) {
          setState(() => _dirty = false);
          _leave();
        }
      },
      child: AppFormScreen(
        key: const Key('transaction_form_screen'),
        header: FormHeader(
          title: _isEdit ? 'Editar $noun' : 'Nuevo $noun',
          onDismiss: () async {
            if (!_dirty || await _confirmDiscard()) {
              if (mounted) {
                setState(() => _dirty = false);
                _leave();
              }
            }
          },
          // The kind toggle rides the header so it stays reachable while the
          // keyboard is up — it decides what the number below means.
          trailing:
              _isEdit
                  ? null
                  : _SegmentedRow<TransactionType>(
                    keyPrefix: 'kind',
                    options: const [
                      (TransactionType.expense, 'Gasto'),
                      (TransactionType.income, 'Ingreso'),
                    ],
                    selected: draft.type,
                    onSelect: (type) => _update(draft.withType(type)),
                  ),
        ),
        footer: ActionButton(
          key: const Key('submit_transaction_button'),
          label: _isEdit ? 'Guardar cambios' : 'Guardar $noun',
          loading: _saving,
          onPressed:
              draft.isSubmittable && !_saving
                  ? () => _submit(householdId, categories)
                  : null,
        ),
        children: [
          AmountField(
            controller: _amount,
            prefix: draft.currency == Currency.pyg ? 'Gs.' : 'USD',
            autofocus: true,
            decimal: draft.currency == Currency.usd,
            onChanged: (raw) {
              final next = draft.copyWith(amount: draft.amount.withRaw(raw));
              _syncController(_amount, next.amount.display);
              _update(next);
            },
          ),
          // FLT-016: the currency selector the legacy form never had. The
          // contract accepts USD movements and the edit form rendered their
          // fields, but nothing could ever create one.
          Center(
            child: _SegmentedRow<Currency>(
              keyPrefix: 'currency',
              options: const [
                (Currency.pyg, 'Guaraníes'),
                (Currency.usd, 'Dólares'),
              ],
              selected: draft.currency,
              onSelect: (currency) {
                final next = draft.withCurrency(currency);
                _syncController(_amount, next.amount.display);
                _syncController(_fxRate, next.fxRate.display);
                _update(next);
              },
            ),
          ),
          if (draft.currency == Currency.usd)
            _FxRateCard(
              controller: _fxRate,
              draft: draft,
              lastUsed: mostRecentUsdRate(history),
              onChanged: (raw) {
                final next = draft.copyWith(fxRate: draft.fxRate.withRaw(raw));
                _syncController(_fxRate, next.fxRate.display);
                _update(next);
              },
              onUseLastRate: (wire) {
                final next = draft.copyWith(
                  fxRate: const FxRateInput.empty().withRaw(
                    wire.replaceFirst('.', ','),
                  ),
                );
                _syncController(_fxRate, next.fxRate.display);
                _update(next);
              },
            ),
          FormSection(
            label: 'Categoría',
            sublabel: recentRoots.isEmpty ? null : 'recientes',
            onSeeAll: () => _pickCategory(householdId, kindCategories, noun),
            child: ChipRow(
              children: [
                for (final category in rootChips)
                  NidoChip(
                    key: Key('category_chip_${category.id}'),
                    label: category.name,
                    selected: selectedRootId == category.id,
                    onPressed:
                        () => _update(
                          draft.copyWith(
                            categoryId: nextRequiredCategoryId(
                              draft.categoryId,
                              category,
                            ),
                          ),
                        ),
                  ),
              ],
            ),
          ),
          if (childChips.isNotEmpty)
            FormSection(
              label: 'Subcategoría (opcional)',
              child: ChipRow(
                children: [
                  for (final child in childChips)
                    NidoChip(
                      key: Key('subcategory_chip_${child.id}'),
                      label: child.name,
                      selected: draft.categoryId == child.id,
                      onPressed:
                          () => _update(
                            draft.copyWith(
                              categoryId: nextRequiredCategoryId(
                                draft.categoryId,
                                child,
                              ),
                            ),
                          ),
                    ),
                ],
              ),
            ),
          // An income asks neither expense question: money did not go out
          // through an account, and it did not go to a merchant.
          if (!draft.isIncome)
            FormSection(
              label: 'Pagado con',
              sublabel: favoriteIds.isEmpty ? null : 'favoritos',
              onSeeAll: () => _pickPaymentSource(paymentSources, favoriteIds),
              child: ChipRow(
                children: [
                  for (final source in sourceChips)
                    NidoChip(
                      key: Key('payment_source_chip_${source.id}'),
                      label: source.name,
                      selected: draft.paymentSourceId == source.id,
                      // Tapping the selected one clears it: "sin medio de
                      // pago" is a legal answer and this is the only place the
                      // chip row can express it.
                      onPressed:
                          () => _update(
                            draft.copyWith(
                              paymentSourceId:
                                  draft.paymentSourceId == source.id
                                      ? null
                                      : source.id,
                            ),
                          ),
                    ),
                ],
              ),
            ),
          NidoFormField(
            label: 'Fecha',
            child: PickerField(
              key: const Key('pick_date_button'),
              value:
                  draft.localDate == _todayLocal
                      ? 'Hoy · ${formatFullLocalDate(draft.localDate)}'
                      : formatFullLocalDate(draft.localDate),
              onPressed: _pickDate,
            ),
          ),
          if (!draft.isIncome)
            NidoFormField(
              label: 'Comercio',
              child: NidoTextField(
                key: const Key('description_field'),
                controller: _description,
                hintText: '¿Dónde fue?',
                maxLength: 200,
                onChanged:
                    (value) => _update(draft.copyWith(description: value)),
              ),
            ),
          if (_notesExpanded)
            NidoFormField(
              label: 'Nota (opcional)',
              child: NidoTextField(
                key: const Key('notes_field'),
                controller: _notes,
                maxLength: 2000,
                maxLines: null,
                onChanged: (value) => _update(draft.copyWith(notes: value)),
              ),
            )
          else
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('add_note_button'),
                onPressed: () => setState(() => _notesExpanded = true),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Agregar nota (opcional)'),
              ),
            ),
          if (_problemsMessage(draft) case final message?)
            InlineNotice(
              key: const Key('draft_problems_notice'),
              message: message,
              tone: NoticeTone.warning,
            ),
          if (_submitError case final message?)
            InlineNotice(
              key: const Key('submit_error_notice'),
              message: message,
              tone: NoticeTone.error,
            ),
          Text(
            'El monto en guaraníes que Nido guarda lo calcula el servidor con '
            'el tipo de cambio que cargaste.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  /// The one problem worth naming while typing. Listing all of them would
  /// scold someone for not having filled in fields they have not reached yet,
  /// so only a *typed but wrong* value speaks up; the disabled save button
  /// covers the merely-incomplete cases.
  String? _problemsMessage(TransactionDraft draft) {
    for (final problem in draft.validate()) {
      switch (problem) {
        case DraftProblem.amountInvalid:
          return 'Ese monto no es válido para ${draft.currency.wireName}.';
        case DraftProblem.amountZero:
          return 'El monto tiene que ser mayor que cero.';
        case DraftProblem.fxRateInvalid:
          return 'Ese tipo de cambio no es válido.';
        case DraftProblem.fxRateZero:
          return 'El tipo de cambio tiene que ser mayor que cero.';
        case DraftProblem.amountMissing:
        case DraftProblem.fxRateMissing:
        case DraftProblem.categoryMissing:
        case DraftProblem.descriptionMissing:
          continue;
      }
    }
    return null;
  }

  Future<void> _pickDate() async {
    final picked = await showLocalDatePickerSheet(
      context: context,
      value: _draft!.localDate,
      today: _todayLocal,
    );
    if (picked != null && mounted) {
      _update(
        _draft!.withLocalDate(picked, todayLocal: _todayLocal, now: _now),
      );
    }
  }

  Future<void> _pickCategory(
    String householdId,
    List<Category> kindCategories,
    String noun,
  ) async {
    final picked = await showCategoryPickerSheet(
      context: context,
      categories: kindCategories,
      selectedCategoryId: _draft!.categoryId,
      subtitle: 'Para este $noun',
      onCreateSubcategory: (root, name) async {
        // Subcategories inherit their root's appearance at creation, the same
        // rule the Categorías screen applies.
        return ref
            .read(categoriesControllerProvider)
            .create(
              householdId,
              CreateCategoryRequest(
                kind: root.kind,
                name: name,
                icon: root.icon,
                color: root.color,
                parentId: root.id,
              ),
            );
      },
    );
    if (picked != null && mounted) {
      _update(
        _draft!.copyWith(
          categoryId: nextRequiredCategoryId(_draft!.categoryId, picked),
        ),
      );
    }
  }

  Future<void> _pickPaymentSource(
    List<PaymentSource> paymentSources,
    List<String> favoriteIds,
  ) async {
    final selection = await showPaymentSourcePickerSheet(
      context: context,
      paymentSources: paymentSources,
      favoriteIds: favoriteIds,
      selectedPaymentSourceId: _draft!.paymentSourceId,
    );
    if (selection != null && mounted) {
      _update(_draft!.copyWith(paymentSourceId: selection.paymentSourceId));
    }
  }
}

/// A compact two-option switch, for kind and currency.
class _SegmentedRow<T> extends StatelessWidget {
  const _SegmentedRow({
    required this.keyPrefix,
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final String keyPrefix;
  final List<(T, String)> options;
  final T selected;
  final void Function(T value) onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: AppRadii.chipRadius,
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (value, label) in options)
            GestureDetector(
              key: Key('${keyPrefix}_option_$value'),
              onTap: () => onSelect(value),
              child: Semantics(
                button: true,
                selected: selected == value,
                label: label,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 120),
                  constraints: const BoxConstraints(
                    minHeight: 36,
                    minWidth: 56,
                  ),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color:
                        selected == value
                            ? AppColors.surface
                            : Colors.transparent,
                    borderRadius: AppRadii.chipRadius,
                  ),
                  child: Text(
                    label,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color:
                          selected == value
                              ? AppColors.ink
                              : AppColors.inkSecondary,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FxRateCard extends StatelessWidget {
  const _FxRateCard({
    required this.controller,
    required this.draft,
    required this.lastUsed,
    required this.onChanged,
    required this.onUseLastRate,
  });

  final TextEditingController controller;
  final TransactionDraft draft;
  final ({String wire, LocalDate localDate})? lastUsed;
  final ValueChanged<String> onChanged;
  final void Function(String wire) onUseLastRate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final preview = draft.previewBaseAmountPyg();

    return NidoCard(
      key: const Key('fx_rate_card'),
      gap: AppSpacing.sm,
      children: [
        const FieldLabel('Tipo de cambio (manual)'),
        NidoTextField(
          key: const Key('fx_rate_field'),
          controller: controller,
          hintText: 'Guaraníes por dólar',
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textAlign: TextAlign.end,
          onChanged: onChanged,
        ),
        if (lastUsed case final last?)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const Key('use_last_fx_rate_button'),
              onPressed: () => onUseLastRate(last.wire),
              child: Text(
                'Último usado: ${formatDecimalEs(last.wire, 0)} · '
                '${formatLocalDateWithoutYear(last.localDate)}',
              ),
            ),
          ),
        if (preview != null)
          Text(
            '≈ Gs. ${formatPygMagnitude(preview.toWire())}',
            key: const Key('fx_preview'),
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium?.copyWith(
              color: AppColors.primary,
            ),
          ),
      ],
    );
  }
}

/// What was just saved, with the two ways out of the flow.
class _SavedConfirmation extends StatelessWidget {
  const _SavedConfirmation({
    required this.transaction,
    required this.categories,
    required this.paymentSources,
    required this.today,
    required this.onAnother,
    required this.onDone,
  });

  final Transaction transaction;
  final List<Category> categories;
  final List<PaymentSource> paymentSources;
  final LocalDate today;
  final VoidCallback onAnother;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final noun =
        transaction.type == TransactionType.income ? 'Ingreso' : 'Gasto';

    return AppFormScreen(
      key: const Key('transaction_saved_screen'),
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ActionButton(
            key: const Key('load_another_button'),
            label: 'Cargar otro ${noun.toLowerCase()}',
            onPressed: onAnother,
          ),
          const SizedBox(height: AppSpacing.base),
          TextButton(
            key: const Key('done_button'),
            onPressed: onDone,
            child: const Text('Listo'),
          ),
        ],
      ),
      children: [
        const SizedBox(height: AppSpacing.lg),
        const Center(
          child: CircleAvatar(
            radius: 36,
            backgroundColor: AppColors.successBackground,
            child: Icon(Icons.check, size: 32, color: AppColors.success),
          ),
        ),
        Text(
          '$noun guardado',
          textAlign: TextAlign.center,
          style: theme.textTheme.displayLarge,
        ),
        NidoCard.single(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.cardPadding,
            vertical: AppSpacing.base,
          ),
          child: MovementRow(
            transaction: transaction,
            categories: categories,
            paymentSources: paymentSources,
            // Tapping the receipt would push a detail screen on top of a
            // confirmation the user has not dismissed yet.
            onTap: () {},
          ),
        ),
        const Center(child: SyncStatusPill(tone: SyncStatusTone.synced)),
        Text(
          'Ya se sincronizó. Los totales de '
          '${formatRecentMovementDateLabel(transaction.localDate, today)} se '
          'actualizaron para los dos.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.inkSecondary,
          ),
        ),
      ],
    );
  }
}
