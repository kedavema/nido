import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_radii.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/auth_error_messages.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/auth/session_machine.dart';
import '../../../core/contracts/households.dart';
import '../../../core/responsive/responsive_layout.dart';
import '../../../core/time/nido_time_zone.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/loading_content.dart';

/// The household's member list, loaded per household id and refreshed by
/// invalidating this provider (errors surface as safe [Exception]s the UI
/// maps through `messageForAuthError`).
final householdMembersProvider = FutureProvider.autoDispose
    .family<List<HouseholdMember>, String>((ref, householdId) async {
      final response = await ref
          .read(sessionControllerProvider.notifier)
          .getMembers(householdId);
      return response.members;
    });

/// M2's authenticated-with-household home (the identity/household subset of
/// the legacy `(tabs)/mas.tsx`): household summary, members with
/// loading/error/retry, owner-only one-use invitation with the token shown
/// exactly once for manual delivery, and sign-out. Financial rows arrive
/// with M3+.
class HouseholdHomeScreen extends ConsumerWidget {
  const HouseholdHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    if (session is! SessionAuthenticated) {
      // The redirect is about to move away; render nothing racy.
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }
    final household = session.activeHousehold;
    if (household == null) {
      return const Scaffold(body: SafeArea(child: LoadingContent()));
    }

    final cards = _HomeCards(session: session, household: household);

    return Scaffold(
      key: const Key('household_home_screen'),
      body: SafeArea(
        child: ResponsiveLayout(
          compact:
              (context, _) => SingleChildScrollView(
                key: const Key('household_home_compact'),
                padding: AppSpacing.screenPadding,
                child: cards.asSingleColumn(),
              ),
          medium:
              (context, _) => SingleChildScrollView(
                key: const Key('household_home_medium'),
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: cards.asSingleColumn(),
                  ),
                ),
              ),
          expanded:
              (context, _) => SingleChildScrollView(
                key: const Key('household_home_expanded'),
                padding: const EdgeInsets.all(AppSpacing.xxl),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1040),
                    child: cards.asTwoColumns(),
                  ),
                ),
              ),
        ),
      ),
    );
  }
}

class _HomeCards {
  const _HomeCards({required this.session, required this.household});

  final SessionAuthenticated session;
  final ActiveHouseholdSummary household;

  Widget _header() => _HomeHeader(session: session);
  Widget _summary() => _HouseholdSummaryCard(household: household);
  Widget _members() => _MembersCard(householdId: household.id);
  Widget? _invite() =>
      household.role == HouseholdRole.owner
          ? _InviteCard(householdId: household.id)
          : null;
  Widget _signOut() => const _SignOutButton();

  Widget asSingleColumn() {
    final invite = _invite();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(),
        const SizedBox(height: AppSpacing.cardGap),
        _summary(),
        const SizedBox(height: AppSpacing.cardGap),
        _members(),
        if (invite != null) ...[
          const SizedBox(height: AppSpacing.cardGap),
          invite,
        ],
        const SizedBox(height: AppSpacing.lg),
        _signOut(),
      ],
    );
  }

  Widget asTwoColumns() {
    final invite = _invite();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(),
        const SizedBox(height: AppSpacing.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _summary(),
                  if (invite != null) ...[
                    const SizedBox(height: AppSpacing.lg),
                    invite,
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.lg),
            Expanded(child: _members()),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        _signOut(),
      ],
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({required this.session});

  final SessionAuthenticated session;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayName = session.profile.user.displayName;
    final initial =
        displayName.trim().isEmpty ? '' : displayName.trim()[0].toUpperCase();

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Tu hogar', style: theme.textTheme.headlineMedium),
              const SizedBox(height: AppSpacing.base),
              Text(
                'Identidad, hogar e integrantes.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.inkSecondary,
                ),
              ),
            ],
          ),
        ),
        Semantics(
          label: 'Sesión de $displayName',
          child: CircleAvatar(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.surface,
            child: Text(initial),
          ),
        ),
      ],
    );
  }
}

class _HouseholdSummaryCard extends StatelessWidget {
  const _HouseholdSummaryCard({required this.household});

  final ActiveHouseholdSummary household;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(household.name, style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.cardGap),
            _DetailRow(
              label: 'Tu rol',
              value:
                  household.role == HouseholdRole.owner
                      ? 'Propietario/a'
                      : 'Integrante',
            ),
            const SizedBox(height: AppSpacing.sm),
            _DetailRow(label: 'Moneda base', value: household.baseCurrency),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.inkSecondary,
          ),
        ),
        Text(value, style: theme.textTheme.bodyMedium),
      ],
    );
  }
}

class _MembersCard extends ConsumerWidget {
  const _MembersCard({required this.householdId});

  final String householdId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final members = ref.watch(householdMembersProvider(householdId));

    return Card(
      key: const Key('members_card'),
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Integrantes', style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.cardGap),
            switch (members) {
              AsyncData(value: final list) when list.isEmpty =>
                const InlineNotice(
                  message: 'Todavía no hay integrantes activos.',
                ),
              AsyncData(value: final list) => Column(
                children: [
                  for (final member in list) _MemberRow(member: member),
                ],
              ),
              AsyncError(error: final error) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InlineNotice(
                    message: messageForAuthError(error),
                    tone: NoticeTone.error,
                  ),
                  const SizedBox(height: AppSpacing.cardGap),
                  OutlinedButton(
                    key: const Key('retry_members_button'),
                    onPressed:
                        () => ref.invalidate(
                          householdMembersProvider(householdId),
                        ),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
              _ => const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.cardGap),
                child: LoadingContent(label: 'Cargando integrantes…'),
              ),
            },
          ],
        ),
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member});

  final HouseholdMember member;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isActive = member.status == HouseholdMemberStatus.active;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(member.displayName, style: theme.textTheme.bodyMedium),
                Text(
                  member.role == HouseholdRole.owner
                      ? 'Propietario/a'
                      : 'Integrante',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.inkSecondary,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color:
                  isActive
                      ? AppColors.successBackground
                      : AppColors.dangerBackground,
              borderRadius: AppRadii.chipRadius,
            ),
            child: Text(
              isActive ? 'Activo' : 'Removido',
              style: theme.textTheme.bodySmall?.copyWith(
                color: isActive ? AppColors.success : AppColors.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InviteCard extends ConsumerStatefulWidget {
  const _InviteCard({required this.householdId});

  final String householdId;

  @override
  ConsumerState<_InviteCard> createState() => _InviteCardState();
}

class _InviteCardState extends ConsumerState<_InviteCard> {
  final TextEditingController _email = TextEditingController();
  String? _error;
  bool _sending = false;
  CreateHouseholdInviteResponse? _created;

  /// Port of `createInvitationRequestGuard`: only the newest request may
  /// touch this panel's state.
  int _generation = 0;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _invite() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    final requestGeneration = ++_generation;

    try {
      final response = await ref
          .read(sessionControllerProvider.notifier)
          .createInvitation(widget.householdId, _email.text);
      if (!mounted || requestGeneration != _generation) {
        return;
      }
      setState(() {
        _created = response;
        _email.clear();
        _sending = false;
      });
    } catch (error) {
      if (!mounted || requestGeneration != _generation) {
        return;
      }
      setState(() {
        _error = messageForAuthError(error);
        _sending = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final created = _created;

    return Card(
      key: const Key('invite_card'),
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Invitar al segundo integrante',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.cardGap),
            if (created == null) ...[
              Text(
                'La invitación dura 72 horas y solo funciona con el correo '
                'indicado.',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: AppSpacing.cardGap),
              TextField(
                key: const Key('invite_email_field'),
                controller: _email,
                maxLength: 254,
                autocorrect: false,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  labelText: 'Correo de Google',
                  hintText: 'persona@example.com',
                  errorText: _error,
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.cardGap),
              FilledButton(
                key: const Key('create_invitation_button'),
                onPressed:
                    _email.text.trim().isEmpty || _sending ? null : _invite,
                child:
                    _sending
                        ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                        : const Text('Crear invitación'),
              ),
            ] else
              _InviteReceipt(
                invite: created,
                onClear:
                    () => setState(() {
                      // The token leaves this view for good — it is one-use and
                      // never persisted on this device.
                      _created = null;
                      _error = null;
                    }),
              ),
          ],
        ),
      ),
    );
  }
}

class _InviteReceipt extends StatelessWidget {
  const _InviteReceipt({required this.invite, required this.onClear});

  final CreateHouseholdInviteResponse invite;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InlineNotice(
          message: 'Invitación creada para ${invite.invite.email}.',
          tone: NoticeTone.success,
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Text(
          'Vence el ${formatAsuncionDateTime(invite.invite.expiresAt)}. '
          'Compartí este token por un canal privado; solo se muestra en '
          'esta pantalla.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Container(
          key: const Key('invite_token_box'),
          padding: const EdgeInsets.all(AppSpacing.cardGap),
          decoration: BoxDecoration(
            color: AppColors.surfaceMuted,
            borderRadius: AppRadii.buttonRadius,
            border: Border.all(color: AppColors.borderStrong),
          ),
          child: SelectableText(
            invite.token,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontFamily: 'monospace',
            ),
            semanticsLabel: 'Token de invitación',
          ),
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Text(
          'Seleccioná el token para copiarlo. Al salir o crear otra '
          'invitación, Nido lo elimina de esta vista.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: AppSpacing.cardGap),
        OutlinedButton(
          key: const Key('clear_invitation_button'),
          onPressed: onClear,
          child: const Text('Crear otra invitación'),
        ),
      ],
    );
  }
}

class _SignOutButton extends ConsumerWidget {
  const _SignOutButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return OutlinedButton(
      key: const Key('home_sign_out_button'),
      style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
      onPressed: () {
        // The offline queue arrives in M4; until then there is nothing
        // pending to warn about before signing out.
        ref.read(sessionControllerProvider.notifier).signOut();
      },
      child: const Text('Cerrar sesión'),
    );
  }
}
