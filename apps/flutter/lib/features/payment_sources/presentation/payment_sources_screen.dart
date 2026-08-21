import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/active_household.dart';
import '../../../core/contracts/households.dart';
import '../../../core/contracts/patch.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
import '../../household/presentation/household_home_screen.dart';
import '../application/payment_sources_providers.dart';

/// Spanish labels for `PAYMENT_SOURCE_TYPES`, in the order the form offers
/// them.
const Map<PaymentSourceType, String> paymentSourceTypeLabels = {
  PaymentSourceType.bankAccount: 'Cuenta bancaria',
  PaymentSourceType.cash: 'Efectivo',
  PaymentSourceType.creditCard: 'Tarjeta de crédito',
  PaymentSourceType.digitalWallet: 'Billetera digital',
  PaymentSourceType.other: 'Otro',
};

/// Full CRUD over the household's payment sources.
class PaymentSourcesScreen extends ConsumerStatefulWidget {
  const PaymentSourcesScreen({super.key});

  @override
  ConsumerState<PaymentSourcesScreen> createState() =>
      _PaymentSourcesScreenState();
}

class _PaymentSourcesScreenState extends ConsumerState<PaymentSourcesScreen> {
  /// `null` when the list is showing; a source when editing it; a
  /// [PaymentSource]-less marker when creating one.
  PaymentSource? _editing;
  bool _creating = false;

  @override
  Widget build(BuildContext context) {
    final householdId = ref.watch(activeHouseholdIdProvider);
    if (householdId == null) {
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }

    if (_creating || _editing != null) {
      return _PaymentSourceEditor(
        key: const Key('payment_source_editor'),
        householdId: householdId,
        existing: _editing,
        onDone:
            () => setState(() {
              _creating = false;
              _editing = null;
            }),
      );
    }

    final sources = ref.watch(paymentSourcesProvider(householdId));
    final members = ref.watch(householdMembersProvider(householdId));

    return Scaffold(
      key: const Key('payment_sources_screen'),
      appBar: AppBar(
        title: const Text('Medios de pago'),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(24),
          child: Padding(
            padding: EdgeInsets.only(
              left: AppSpacing.screen,
              right: AppSpacing.screen,
              bottom: AppSpacing.sm,
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Son informativos: Nido no calcula saldos por medio.',
              ),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('add_payment_source_button'),
        onPressed: () => setState(() => _creating = true),
        icon: const Icon(Icons.add),
        label: const Text('Agregar medio'),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(paymentSourcesProvider(householdId));
            await ref.read(paymentSourcesProvider(householdId).future);
          },
          child: switch (sources) {
            AsyncData(value: final list) => _SourceList(
              householdId: householdId,
              sources: list,
              members: members.valueOrNull ?? const [],
              onEdit: (source) => setState(() => _editing = source),
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
                      () => ref.invalidate(paymentSourcesProvider(householdId)),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
            _ => const Center(child: LoadingContent(label: 'Cargando medios…')),
          },
        ),
      ),
    );
  }
}

class _SourceList extends ConsumerWidget {
  const _SourceList({
    required this.householdId,
    required this.sources,
    required this.members,
    required this.onEdit,
  });

  final String householdId;
  final List<PaymentSource> sources;
  final List<HouseholdMember> members;
  final void Function(PaymentSource source) onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    if (sources.isEmpty) {
      return ListView(
        padding: AppSpacing.screenPadding,
        children: const [
          InlineNotice(message: 'Todavía no hay medios de pago.'),
        ],
      );
    }

    // Active first; within each group the API's own order is kept.
    final ordered = [
      ...sources.where((source) => source.isActive),
      ...sources.where((source) => !source.isActive),
    ];

    return ListView(
      padding: AppSpacing.screenPadding,
      children: [
        Card(
          child: Padding(
            padding: AppSpacing.cardInsets,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final source in ordered)
                  _SourceRow(
                    householdId: householdId,
                    source: source,
                    ownerName: _ownerName(source),
                    onEdit: () => onEdit(source),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Text(
          'Un medio con movimientos no se borra: se archiva (deja de '
          'ofrecerse al cargar, el historial queda intacto).',
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.inkSecondary,
          ),
        ),
        // The FAB overlaps the last rows otherwise.
        const SizedBox(height: 72),
      ],
    );
  }

  String? _ownerName(PaymentSource source) {
    final ownerUserId = source.ownerUserId;
    if (ownerUserId == null) {
      return null;
    }
    for (final member in members) {
      if (member.userId == ownerUserId) {
        return member.displayName;
      }
    }
    return 'Titular';
  }
}

class _SourceRow extends ConsumerWidget {
  const _SourceRow({
    required this.householdId,
    required this.source,
    required this.ownerName,
    required this.onEdit,
  });

  final String householdId;
  final PaymentSource source;
  final String? ownerName;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subtitle = [
      paymentSourceTypeLabels[source.type]!,
      if (ownerName != null) ownerName!,
      if (!source.isActive) 'Archivado',
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(source.name, style: theme.textTheme.bodyMedium),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.inkSecondary,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            key: Key('edit_payment_source_${source.id}'),
            onPressed: onEdit,
            child: const Text('Editar'),
          ),
          if (source.isActive)
            TextButton(
              key: Key('archive_payment_source_${source.id}'),
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              onPressed:
                  () => showDestructiveConfirmDialog(
                    context: context,
                    title: '¿Archivar ${source.name}?',
                    message:
                        'Deja de ofrecerse al cargar un movimiento. Los '
                        'movimientos ya cargados con este medio lo siguen '
                        'mostrando y no cambian de monto.',
                    confirmLabel: 'Archivar',
                    onConfirm:
                        () => ref
                            .read(paymentSourcesControllerProvider)
                            .archive(householdId, source.id),
                  ),
              child: const Text('Archivar'),
            ),
        ],
      ),
    );
  }
}

class _PaymentSourceEditor extends ConsumerStatefulWidget {
  const _PaymentSourceEditor({
    super.key,
    required this.householdId,
    required this.existing,
    required this.onDone,
  });

  final String householdId;
  final PaymentSource? existing;
  final VoidCallback onDone;

  @override
  ConsumerState<_PaymentSourceEditor> createState() =>
      _PaymentSourceEditorState();
}

class _PaymentSourceEditorState extends ConsumerState<_PaymentSourceEditor> {
  late final TextEditingController _name;
  late PaymentSourceType _type;
  late String? _ownerUserId;
  late bool _isActive;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _name = TextEditingController(text: existing?.name ?? '');
    _type = existing?.type ?? PaymentSourceType.cash;
    _ownerUserId = existing?.ownerUserId;
    _isActive = existing?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final controller = ref.read(paymentSourcesControllerProvider);
    final existing = widget.existing;
    try {
      if (existing == null) {
        await controller.create(
          widget.householdId,
          CreatePaymentSourceRequest(
            name: _name.text,
            type: _type,
            ownerUserId: _ownerUserId,
          ),
        );
      } else {
        await controller.update(
          widget.householdId,
          existing.id,
          UpdatePaymentSourceRequest(
            name: _name.text,
            type: _type,
            ownerUserId: Patch.of(_ownerUserId),
            isActive: _isActive,
          ),
        );
      }
      if (mounted) {
        widget.onDone();
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = messageForActionError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final members =
        ref
            .watch(householdMembersProvider(widget.householdId))
            .valueOrNull
            ?.where((member) => member.status == HouseholdMemberStatus.active)
            .toList(growable: false) ??
        const <HouseholdMember>[];

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          key: const Key('close_payment_source_editor'),
          icon: const Icon(Icons.close),
          onPressed: widget.onDone,
        ),
        title: Text(widget.existing == null ? 'Nuevo medio' : 'Editar medio'),
      ),
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenPadding,
          children: [
            TextField(
              key: const Key('payment_source_name_field'),
              controller: _name,
              autofocus: true,
              maxLength: 100,
              decoration: const InputDecoration(labelText: 'Nombre'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Text('Tipo', style: theme.textTheme.bodySmall),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final entry in paymentSourceTypeLabels.entries)
                  ChoiceChip(
                    key: Key('payment_source_type_${entry.key.wire}'),
                    label: Text(entry.value),
                    selected: _type == entry.key,
                    onSelected: (_) => setState(() => _type = entry.key),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Text('Titular informativo', style: theme.textTheme.bodySmall),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                ChoiceChip(
                  key: const Key('payment_source_owner_none'),
                  label: const Text('Sin titular'),
                  selected: _ownerUserId == null,
                  onSelected: (_) => setState(() => _ownerUserId = null),
                ),
                for (final member in members)
                  ChoiceChip(
                    key: Key('payment_source_owner_${member.userId}'),
                    label: Text(member.displayName),
                    selected: _ownerUserId == member.userId,
                    onSelected:
                        (_) => setState(() => _ownerUserId = member.userId),
                  ),
              ],
            ),
            if (widget.existing != null) ...[
              const SizedBox(height: AppSpacing.cardGap),
              Text('Estado', style: theme.textTheme.bodySmall),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.sm,
                children: [
                  ChoiceChip(
                    key: const Key('payment_source_state_active'),
                    label: const Text('Activo'),
                    selected: _isActive,
                    onSelected: (_) => setState(() => _isActive = true),
                  ),
                  ChoiceChip(
                    key: const Key('payment_source_state_archived'),
                    label: const Text('Archivado'),
                    selected: !_isActive,
                    onSelected: (_) => setState(() => _isActive = false),
                  ),
                ],
              ),
            ],
            if (_error case final message?) ...[
              const SizedBox(height: AppSpacing.cardGap),
              InlineNotice(message: message, tone: NoticeTone.error),
            ],
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              key: const Key('save_payment_source_button'),
              onPressed:
                  _name.text.trim().isEmpty || _saving ? null : () => _save(),
              child:
                  _saving
                      ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                      : const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }
}
