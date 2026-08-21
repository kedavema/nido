import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_spacing.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/auth/session_machine.dart';
import '../../../core/widgets/inline_notice.dart';
import '../../../core/widgets/action_button.dart';
import '../../../core/widgets/loading_content.dart';

/// Full-screen wait while the persisted session resolves (the legacy
/// `loading.tsx`). Rendered by [SessionGate], never routed to.
class SessionLoadingScreen extends StatelessWidget {
  const SessionLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      key: Key('session_loading_screen'),
      body: SafeArea(child: LoadingContent(label: 'Abriendo Nido…')),
    );
  }
}

/// Recoverable session failure (the legacy `session-error.tsx`): the message
/// is already safe Spanish copy, retry re-runs the whole auth wiring, and
/// sign-out is offered only when it is a meaningful exit.
class SessionErrorScreen extends ConsumerWidget {
  const SessionErrorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final state = ref.watch(sessionControllerProvider);
    final message =
        state is SessionRecoverableError
            ? state.message
            : 'No pudimos iniciar Nido.';
    final canSignOut = state is SessionRecoverableError && state.canSignOut;
    final controller = ref.read(sessionControllerProvider.notifier);

    return Scaffold(
      key: const Key('session_error_screen'),
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
                  Text(
                    'No pudimos conectar',
                    style: theme.textTheme.headlineMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.base),
                  Text(
                    'Tus datos no se modificaron.',
                    style: theme.textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  InlineNotice(message: message, tone: NoticeTone.error),
                  const SizedBox(height: AppSpacing.lg),
                  ActionButton(
                    key: const Key('session_retry_button'),
                    label: 'Reintentar',
                    onPressed: controller.retry,
                  ),
                  if (canSignOut) ...[
                    const SizedBox(height: AppSpacing.cardGap),
                    ActionButton(
                      key: const Key('session_sign_out_button'),
                      label: 'Cerrar sesión',
                      variant: ActionButtonVariant.secondary,
                      onPressed: () {
                        controller.signOut();
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Wraps every routed screen: while the session is unresolved (initializing)
/// or failed (recoverable error) the gate renders the corresponding screen
/// in place, so the router's redirect never has to route to a transient
/// state — that is what keeps redirects pure and flicker-free.
class SessionGate extends ConsumerWidget {
  const SessionGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sessionControllerProvider);
    return switch (state) {
      SessionInitializing() => const SessionLoadingScreen(),
      SessionRecoverableError() => const SessionErrorScreen(),
      SessionUnauthenticated() || SessionAuthenticated() => child,
    };
  }
}
