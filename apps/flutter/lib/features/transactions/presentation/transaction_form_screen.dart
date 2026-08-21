import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
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
/// One screen for both, as in the legacy app: the fields are identical and
/// the only differences are the title, whether the kind toggle is offered
/// (an existing movement's kind is not something to flip — see
/// [TransactionDraft.toUpdateRequest]) and what happens on save.
class TransactionFormScreen extends ConsumerStatefulWidget {
  const TransactionFormScreen({
    super.key,
    this.transactionId,
    this.initialType = TransactionType.expense,
  });

  /// `null` creates; an id edits that movement.
  final String? transactionId;

  /// Only the entry point decides the initial kind, and anything
  /// unrecognised is an expense — the common case and every caller's default.
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
      return _errorScaffold(householdId, error);
    }

    if (!categories.hasValue ||
        !paymentSources.hasValue ||
        !history.hasValue ||
        !original.hasValue) {
      return const Scaffold(
        body: SafeArea(child: LoadingContent(label: 'Cargando…')),
      );
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

  Widget _errorScaffold(String householdId, Object error) {
    return Scaffold(
      appBar: AppBar(title: const Text('Movimiento')),
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenPadding,
          children: [
            InlineNotice(
              message: messageForActionError(error),
              tone: NoticeTone.error,
            ),
            const SizedBox(height: AppSpacing.cardGap),
            OutlinedButton(
              key: const Key('retry_button'),
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
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
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

    final discard = await showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            key: const Key('discard_dialog'),
            title: Text('¿Descartar este $noun?'),
            content: Text(
              summary.isEmpty
                  ? 'Tenés cambios sin guardar. Si seguís editando, todo '
                      'queda como estaba.'
                  : 'Tenés datos sin guardar: $summary. Si seguís editando, '
                      'todo queda como estaba.',
            ),
            actions: [
              TextButton(
                key: const Key('keep_editing_button'),
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Seguir editando'),
              ),
              FilledButton(
                key: const Key('discard_button'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.danger,
                ),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Descartar'),
              ),
            ],
          ),
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
    final rootChips = rootCategoryChips(kindCategories, [
      selectedRootId,
      ...recentRoots,
    ], quickChipLimit);
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
      child: Scaffold(
        key: const Key('transaction_form_screen'),
        appBar: AppBar(title: Text(_isEdit ? 'Editar $noun' : 'Nuevo $noun')),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: AppSpacing.screenPadding,
            child: FilledButton(
              key: const Key('submit_transaction_button'),
              onPressed:
                  draft.isSubmittable && !_saving
                      ? () => _submit(householdId, categories)
                      : null,
              child:
                  _saving
                      ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                      : Text(_isEdit ? 'Guardar cambios' : 'Guardar $noun'),
            ),
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: AppSpacing.screenPadding,
            children: [
              if (!_isEdit)
                _SegmentedRow<TransactionType>(
                  keyPrefix: 'kind',
                  options: const [
                    (TransactionType.expense, 'Gasto'),
                    (TransactionType.income, 'Ingreso'),
                  ],
                  selected: draft.type,
                  onSelect: (type) => _update(draft.withType(type)),
                ),
              const SizedBox(height: AppSpacing.cardGap),
              // FLT-016: the currency selector the legacy form never had.
              // The contract accepts USD movements and the edit form rendered
              // their fields, but nothing could ever create one.
              _SegmentedRow<Currency>(
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
              const SizedBox(height: AppSpacing.cardGap),
              _AmountField(
                controller: _amount,
                currency: draft.currency,
                onChanged: (raw) {
                  final next = draft.copyWith(
                    amount: draft.amount.withRaw(raw),
                  );
                  _syncController(_amount, next.amount.display);
                  _update(next);
                },
              ),
              if (draft.currency == Currency.usd) ...[
                const SizedBox(height: AppSpacing.cardGap),
                _FxRateCard(
                  controller: _fxRate,
                  draft: draft,
                  lastUsed: mostRecentUsdRate(history),
                  onChanged: (raw) {
                    final next = draft.copyWith(
                      fxRate: draft.fxRate.withRaw(raw),
                    );
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
              ],
              const SizedBox(height: AppSpacing.cardGap),
              _ChipSection(
                label: 'Categoría',
                sublabel: recentRoots.isEmpty ? null : 'recientes',
                onSeeAll:
                    () => _pickCategory(householdId, kindCategories, noun),
                children: [
                  for (final category in rootChips)
                    ChoiceChip(
                      key: Key('category_chip_${category.id}'),
                      label: Text(category.name),
                      selected: selectedRootId == category.id,
                      onSelected:
                          (_) => _update(
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
              if (childChips.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.cardGap),
                _ChipSection(
                  label: 'Subcategoría (opcional)',
                  children: [
                    for (final child in childChips)
                      ChoiceChip(
                        key: Key('subcategory_chip_${child.id}'),
                        label: Text(child.name),
                        selected: draft.categoryId == child.id,
                        onSelected:
                            (_) => _update(
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
              ],
              // An income asks neither expense question: money did not go out
              // through an account, and it did not go to a merchant.
              if (!draft.isIncome) ...[
                const SizedBox(height: AppSpacing.cardGap),
                _ChipSection(
                  label: 'Pagado con',
                  sublabel: favoriteIds.isEmpty ? null : 'favoritos',
                  onSeeAll:
                      () => _pickPaymentSource(paymentSources, favoriteIds),
                  children: [
                    for (final source in sourceChips)
                      ChoiceChip(
                        key: Key('payment_source_chip_${source.id}'),
                        label: Text(source.name),
                        selected: draft.paymentSourceId == source.id,
                        // Tapping the selected one clears it: "sin medio de
                        // pago" is a legal answer and this is the only place
                        // the chips row can express it.
                        onSelected:
                            (_) => _update(
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
              ],
              const SizedBox(height: AppSpacing.cardGap),
              const _FieldLabel(label: 'Fecha'),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                key: const Key('pick_date_button'),
                onPressed: () => _pickDate(),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      draft.localDate == _todayLocal
                          ? 'Hoy · ${formatFullLocalDate(draft.localDate)}'
                          : formatFullLocalDate(draft.localDate),
                    ),
                    const Icon(Icons.expand_more, size: 18),
                  ],
                ),
              ),
              if (!draft.isIncome) ...[
                const SizedBox(height: AppSpacing.cardGap),
                TextField(
                  key: const Key('description_field'),
                  controller: _description,
                  maxLength: 200,
                  decoration: const InputDecoration(
                    labelText: 'Comercio',
                    hintText: '¿Dónde fue?',
                    counterText: '',
                  ),
                  onChanged:
                      (value) => _update(draft.copyWith(description: value)),
                ),
              ],
              const SizedBox(height: AppSpacing.cardGap),
              if (_notesExpanded)
                TextField(
                  key: const Key('notes_field'),
                  controller: _notes,
                  maxLength: 2000,
                  maxLines: null,
                  decoration: const InputDecoration(
                    labelText: 'Nota (opcional)',
                    counterText: '',
                  ),
                  onChanged: (value) => _update(draft.copyWith(notes: value)),
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
              if (_problemsMessage(draft) case final message?) ...[
                const SizedBox(height: AppSpacing.cardGap),
                InlineNotice(
                  key: const Key('draft_problems_notice'),
                  message: message,
                  tone: NoticeTone.warning,
                ),
              ],
              if (_submitError case final message?) ...[
                const SizedBox(height: AppSpacing.cardGap),
                InlineNotice(
                  key: const Key('submit_error_notice'),
                  message: message,
                  tone: NoticeTone.error,
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              Text(
                'El monto en guaraníes que Nido guarda lo calcula el servidor '
                'con el tipo de cambio que cargaste.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.inkSecondary,
                ),
              ),
            ],
          ),
        ),
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

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, this.sublabel});

  final String label;
  final String? sublabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Text(label, style: theme.textTheme.bodySmall),
        if (sublabel case final text?) ...[
          const SizedBox(width: AppSpacing.sm),
          Text(
            '· $text',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.inkSecondary,
            ),
          ),
        ],
      ],
    );
  }
}

class _ChipSection extends StatelessWidget {
  const _ChipSection({
    required this.label,
    required this.children,
    this.sublabel,
    this.onSeeAll,
  });

  final String label;
  final String? sublabel;
  final VoidCallback? onSeeAll;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _FieldLabel(label: label, sublabel: sublabel),
            if (onSeeAll case final callback?)
              TextButton(
                key: Key('see_all_$label'),
                onPressed: callback,
                child: const Text('Ver todas'),
              ),
          ],
        ),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: children,
        ),
      ],
    );
  }
}

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
    return Wrap(
      spacing: AppSpacing.sm,
      children: [
        for (final (value, label) in options)
          ChoiceChip(
            key: Key('${keyPrefix}_option_$value'),
            label: Text(label),
            selected: selected == value,
            onSelected: (_) => onSelect(value),
          ),
      ],
    );
  }
}

class _AmountField extends StatelessWidget {
  const _AmountField({
    required this.controller,
    required this.currency,
    required this.onChanged,
  });

  final TextEditingController controller;
  final Currency currency;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return TextField(
      key: const Key('amount_field'),
      controller: controller,
      autofocus: true,
      textAlign: TextAlign.center,
      style: theme.textTheme.headlineLarge,
      // The platform's own numeric keyboard: locale-correct layout,
      // backspace, and no caret-management bugs a custom keypad would add.
      keyboardType: TextInputType.numberWithOptions(
        decimal: currency == Currency.usd,
      ),
      inputFormatters: [
        // Belt to the sanitizer's braces: keeps an IME from inserting
        // characters the draft would silently drop.
        FilteringTextInputFormatter.allow(
          currency == Currency.pyg ? RegExp(r'[\d.]') : RegExp(r'[\d.,]'),
        ),
      ],
      decoration: InputDecoration(
        labelText: 'Monto',
        prefixText: currency == Currency.pyg ? 'Gs. ' : r'USD $ ',
      ),
      onChanged: onChanged,
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

    return Container(
      key: const Key('fx_rate_card'),
      padding: AppSpacing.cardInsets,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadii.cardRadius,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Tipo de cambio (manual)', style: theme.textTheme.bodyMedium),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            key: const Key('fx_rate_field'),
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[\d.,]')),
            ],
            decoration: const InputDecoration(
              prefixText: 'Gs. ',
              labelText: 'Guaraníes por dólar',
            ),
            onChanged: onChanged,
          ),
          if (lastUsed case final last?) ...[
            const SizedBox(height: AppSpacing.sm),
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
          ],
          if (preview != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '≈ Gs. ${formatPygMagnitude(preview.toWire())}',
              key: const Key('fx_preview'),
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
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

    return Scaffold(
      key: const Key('transaction_saved_screen'),
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenPadding,
          children: [
            const SizedBox(height: AppSpacing.xxl),
            const Center(
              child: CircleAvatar(
                radius: 36,
                backgroundColor: AppColors.successBackground,
                child: Icon(Icons.check, size: 32, color: AppColors.success),
              ),
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Text(
              '$noun guardado',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineMedium,
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.cardPadding,
                ),
                child: MovementRow(
                  transaction: transaction,
                  categories: categories,
                  paymentSources: paymentSources,
                  // Tapping the receipt would push a detail screen on top of
                  // a confirmation the user has not dismissed yet.
                  onTap: () {},
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Text(
              'Ya se sincronizó. Los totales de '
              '${formatRecentMovementDateLabel(transaction.localDate, today)} '
              'se actualizaron para los dos.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.inkSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.xxl),
            FilledButton(
              key: const Key('load_another_button'),
              onPressed: onAnother,
              child: Text('Cargar otro ${noun.toLowerCase()}'),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              key: const Key('done_button'),
              onPressed: onDone,
              child: const Text('Listo'),
            ),
          ],
        ),
      ),
    );
  }
}
