import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/auth_error_messages.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/contracts/households.dart';
import '../../../core/widgets/inline_notice.dart';

/// Accepting a one-use invitation token (port of
/// `apps/mobile/src/app/invitation.tsx`). The token is pasted, used once,
/// and never persisted or logged on this device.
class InvitationScreen extends ConsumerStatefulWidget {
  const InvitationScreen({super.key});

  @override
  ConsumerState<InvitationScreen> createState() => _InvitationScreenState();
}

class _InvitationScreenState extends ConsumerState<InvitationScreen> {
  final TextEditingController _token = TextEditingController();
  String? _error;
  bool _submitting = false;

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .acceptInvitation(_token.text);
      // Success adds the household; the router redirect moves home.
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = messageForAuthError(error);
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canSubmit = isValidInviteToken(_token.text) && !_submitting;

    return Scaffold(
      key: const Key('invitation_screen'),
      appBar: AppBar(
        leading: BackButton(
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.onboarding);
            }
          },
        ),
        title: const Text('Entrar a un hogar'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: AppSpacing.screenPadding,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Pegá el token que te compartió la persona propietaria '
                    'del hogar.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Card(
                    child: Padding(
                      padding: AppSpacing.cardInsets,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Iniciá sesión con el mismo correo de Google al '
                            'que se dirigió la invitación.',
                            style: theme.textTheme.bodyMedium,
                          ),
                          const SizedBox(height: AppSpacing.cardGap),
                          TextField(
                            key: const Key('invitation_token_field'),
                            controller: _token,
                            maxLength: 43,
                            autocorrect: false,
                            enableSuggestions: false,
                            decoration: InputDecoration(
                              labelText: 'Token de invitación',
                              hintText: 'Pegá acá el token de 43 caracteres',
                              errorText: _error,
                            ),
                            onChanged: (_) => setState(() {}),
                            onSubmitted: (_) {
                              if (canSubmit) {
                                _accept();
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.cardGap),
                  const InlineNotice(
                    message:
                        'El token es de un solo uso. Nido no lo guarda en '
                        'este dispositivo ni lo escribe en logs.',
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  FilledButton(
                    key: const Key('accept_invitation_button'),
                    onPressed: canSubmit ? _accept : null,
                    child:
                        _submitting
                            ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                            : const Text('Aceptar invitación'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
