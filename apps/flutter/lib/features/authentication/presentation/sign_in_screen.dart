import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_radii.dart';
import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/nido_card.dart';

/// The sign-in screen (port of `apps/mobile/src/app/sign-in.tsx`): brand,
/// value checklist, the single Google CTA and the shared-household legal
/// note. Google is the only way in — each partner signs in with their own
/// account and the household is shared.
class SignInScreen extends ConsumerWidget {
  const SignInScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Scaffold(
      key: const Key('sign_in_screen'),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: AppSpacing.screenPadding,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _Brand(),
                  const SizedBox(height: AppSpacing.lg),
                  const NidoCard(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _ChecklistRow(
                        text:
                            'Un solo hogar compartido: los dos ven todo, '
                            'siempre.',
                      ),
                      _ChecklistRow(
                        text: 'Cargá un gasto en segundos, incluso sin señal.',
                      ),
                      _ChecklistRow(
                        text: 'Presupuesto mensual en guaraníes, sin vueltas.',
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  ActionButton(
                    key: const Key('google_sign_in_button'),
                    label: 'Continuar con Google',
                    icon: Icons.account_circle_outlined,
                    onPressed: () {
                      ref.read(sessionControllerProvider.notifier).signIn();
                    },
                  ),
                  const SizedBox(height: AppSpacing.screen),
                  Text(
                    'Cada uno entra con su propia cuenta. '
                    'El hogar es de los dos.',
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.base),
                  Text(
                    'Al continuar aceptás los Términos y la Política de '
                    'privacidad.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.inkSecondary,
                    ),
                    textAlign: TextAlign.center,
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

class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Container(
          width: 76,
          height: 76,
          decoration: const BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.all(Radius.circular(17)),
          ),
          alignment: Alignment.center,
          child: const Icon(
            Icons.home_outlined,
            color: AppColors.background,
            size: 40,
          ),
        ),
        const SizedBox(height: AppSpacing.cardGap),
        Text('Nido', style: theme.textTheme.headlineMedium),
        const SizedBox(height: AppSpacing.base),
        Text(
          'La plata de la casa, clara para los dos.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppColors.inkSecondary,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _ChecklistRow extends StatelessWidget {
  const _ChecklistRow({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22,
          height: 22,
          margin: const EdgeInsets.only(top: 2),
          decoration: const BoxDecoration(
            color: AppColors.successBackground,
            borderRadius: AppRadii.chipRadius,
          ),
          child: const Icon(Icons.check, size: 14, color: AppColors.success),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
        ),
      ],
    );
  }
}
