import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/active_household.dart';
import '../../../core/contracts/households.dart';
import '../../../core/contracts/patch.dart';
import '../../../core/contracts/payment_sources.dart';
import '../../../core/errors/error_messages.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/app_screen.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../../core/widgets/form_fields.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';
import '../../../core/widgets/nido_card.dart';
import '../../../core/widgets/nido_chip.dart';
import '../../../core/widgets/screen_header.dart';
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

    final header = FormHeader(
      title: 'Medios de pago',
      subtitle: 'Son informativos: Nido no calcula saldos por medio.',
      onDismiss: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(AppRoutes.root);
        }
      },
      dismissIcon: FormDismissIcon.back,
    );

    final floatingAction = ActionPill(
      key: const Key('add_payment_source_button'),
      label: 'Agregar medio',
      icon: Icons.add,
      onPressed: () => setState(() => _creating = true),
    );

    Future<void> refresh() async {
      ref.invalidate(paymentSourcesProvider(householdId));
      await ref.read(paymentSourcesProvider(householdId).future);
    }

    return switch (sources) {
      AsyncData(value: final list) => AppScreen(
        key: const Key('payment_sources_screen'),
        header: header,
        floatingAction: floatingAction,
        onRefresh: refresh,
        children: [
          if (list.isEmpty)
            const InlineNotice(message: 'Todavía no hay medios de pago.')
          else
            _SourceList(
              householdId: householdId,
              sources: list,
              members: members.valueOrNull ?? const [],
              onEdit: (source) => setState(() => _editing = source),
            ),
          Text(
            'Un medio con movimientos no se borra: se archiva (deja de '
            'ofrecerse al cargar, el historial queda intacto).',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
      AsyncError(error: final error) => AppScreen(
        key: const Key('payment_sources_screen'),
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
            onPressed:
                () => ref.invalidate(paymentSourcesProvider(householdId)),
          ),
        ],
      ),
      _ => AppScreen(
        key: const Key('payment_sources_screen'),
        header: header,
        children: const [LoadingContent(label: 'Cargando medios…')],
      ),
    };
  }
}

class _SourceList extends StatelessWidget {
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

  @override
  Widget build(BuildContext context) {
    // Active first; within each group the API's own order is kept.
    final ordered = [
      ...sources.where((source) => source.isActive),
      ...sources.where((source) => !source.isActive),
    ];

    return NidoCard(
      gap: 0,
      children: [
        for (var index = 0; index < ordered.length; index++)
          _SourceRow(
            householdId: householdId,
            source: ordered[index],
            ownerName: _ownerName(ordered[index]),
            onEdit: () => onEdit(ordered[index]),
            showDivider: index < ordered.length - 1,
          ),
      ],
    );
  }
}

class _SourceRow extends ConsumerWidget {
  const _SourceRow({
    required this.householdId,
    required this.source,
    required this.ownerName,
    required this.onEdit,
    required this.showDivider,
  });

  final String householdId;
  final PaymentSource source;
  final String? ownerName;
  final VoidCallback onEdit;
  final bool showDivider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subtitle = [
      paymentSourceTypeLabels[source.type]!,
      if (ownerName != null) ownerName!,
      if (!source.isActive) 'Archivado',
    ].join(' · ');

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(source.name, style: theme.textTheme.bodyMedium),
                    Text(subtitle, style: theme.textTheme.bodySmall),
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
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.danger,
                  ),
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
        ),
        if (showDivider) const Divider(height: 1, color: AppColors.border),
      ],
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
    final members =
        ref
            .watch(householdMembersProvider(widget.householdId))
            .valueOrNull
            ?.where((member) => member.status == HouseholdMemberStatus.active)
            .toList(growable: false) ??
        const <HouseholdMember>[];

    return AppFormScreen(
      header: FormHeader(
        title: widget.existing == null ? 'Nuevo medio' : 'Editar medio',
        onDismiss: widget.onDone,
      ),
      footer: ActionButton(
        key: const Key('save_payment_source_button'),
        label: 'Guardar',
        loading: _saving,
        onPressed: _name.text.trim().isEmpty || _saving ? null : _save,
      ),
      children: [
        NidoFormField(
          label: 'Nombre',
          child: NidoTextField(
            key: const Key('payment_source_name_field'),
            controller: _name,
            autofocus: true,
            maxLength: 100,
            onChanged: (_) => setState(() {}),
          ),
        ),
        NidoFormField(
          label: 'Tipo',
          child: ChipRow(
            children: [
              for (final entry in paymentSourceTypeLabels.entries)
                NidoChip(
                  key: Key('payment_source_type_${entry.key.wire}'),
                  label: entry.value,
                  selected: _type == entry.key,
                  onPressed: () => setState(() => _type = entry.key),
                ),
            ],
          ),
        ),
        NidoFormField(
          label: 'Titular informativo',
          child: ChipRow(
            children: [
              NidoChip(
                key: const Key('payment_source_owner_none'),
                label: 'Sin titular',
                selected: _ownerUserId == null,
                onPressed: () => setState(() => _ownerUserId = null),
              ),
              for (final member in members)
                NidoChip(
                  key: Key('payment_source_owner_${member.userId}'),
                  label: member.displayName,
                  selected: _ownerUserId == member.userId,
                  onPressed: () => setState(() => _ownerUserId = member.userId),
                ),
            ],
          ),
        ),
        if (widget.existing != null)
          NidoFormField(
            label: 'Estado',
            child: ChipRow(
              children: [
                NidoChip(
                  key: const Key('payment_source_state_active'),
                  label: 'Activo',
                  selected: _isActive,
                  onPressed: () => setState(() => _isActive = true),
                ),
                NidoChip(
                  key: const Key('payment_source_state_archived'),
                  label: 'Archivado',
                  selected: !_isActive,
                  onPressed: () => setState(() => _isActive = false),
                ),
              ],
            ),
          ),
        if (_error case final message?)
          InlineNotice(message: message, tone: NoticeTone.error),
      ],
    );
  }
}
