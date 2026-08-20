import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_radii.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/auth_error_messages.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/auth/session_machine.dart';

String? _firstNameFrom(String? displayName) {
  final trimmed = displayName?.trim() ?? '';
  if (trimmed.isEmpty) {
    return null;
  }
  return trimmed.split(RegExp(r'\s+')).first;
}

/// Household creation for an authenticated user without a household (port of
/// `apps/mobile/src/app/onboarding.tsx`). There is nowhere to go back to:
/// the exits are creating a household, pasting an invitation token, or
/// signing out.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final TextEditingController _name = TextEditingController();
  String? _error;
  bool _submitting = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Escribí un nombre para tu hogar.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .createHousehold(_name.text);
      // Success resolves the session to authenticated-with-household; the
      // router redirect leaves this screen on its own.
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
    final session = ref.watch(sessionControllerProvider);
    final firstName =
        session is SessionAuthenticated
            ? _firstNameFrom(session.identity.displayName)
            : null;
    final subtitle =
        firstName == null
            ? 'Hola · después invitás a tu pareja'
            : 'Hola, $firstName · después invitás a tu pareja';
    final canSubmit = _name.text.trim().isNotEmpty && !_submitting;

    return Scaffold(
      key: const Key('onboarding_screen'),
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
                  Text('Crear tu hogar', style: theme.textTheme.headlineMedium),
                  const SizedBox(height: AppSpacing.base),
                  Text(subtitle, style: theme.textTheme.bodyMedium),
                  const SizedBox(height: AppSpacing.lg),
                  Card(
                    child: Padding(
                      padding: AppSpacing.cardInsets,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextField(
                            key: const Key('household_name_field'),
                            controller: _name,
                            maxLength: 100,
                            textCapitalization: TextCapitalization.words,
                            decoration: InputDecoration(
                              labelText: 'Nombre del hogar',
                              hintText: 'Ej. Casa Ale & Kevin',
                              errorText: _error,
                            ),
                            onChanged: (_) => setState(() {}),
                            onSubmitted: (_) => _submit(),
                          ),
                          const SizedBox(height: AppSpacing.cardGap),
                          Text(
                            'Moneda principal',
                            style: theme.textTheme.bodySmall,
                          ),
                          const SizedBox(height: AppSpacing.base),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            decoration: const BoxDecoration(
                              color: AppColors.primaryTint,
                              borderRadius: AppRadii.chipRadius,
                            ),
                            child: Text(
                              'Guaraní · Gs.',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.base),
                          Text(
                            'Los gastos en USD se convierten con un tipo de '
                            'cambio que cargás vos.',
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  FilledButton(
                    key: const Key('create_household_button'),
                    onPressed: canSubmit ? _submit : null,
                    child:
                        _submitting
                            ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                            : const Text('Crear hogar'),
                  ),
                  const SizedBox(height: AppSpacing.screen),
                  TextButton(
                    key: const Key('open_invitation_button'),
                    onPressed: () => context.go(AppRoutes.invitation),
                    child: const Text(
                      '¿Ya tenés una invitación? Ingresar token',
                    ),
                  ),
                  const SizedBox(height: AppSpacing.base),
                  OutlinedButton(
                    key: const Key('onboarding_sign_out_button'),
                    onPressed: () {
                      ref.read(sessionControllerProvider.notifier).signOut();
                    },
                    child: const Text('Cerrar sesión'),
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
