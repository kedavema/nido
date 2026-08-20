import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/responsive/responsive_breakpoints.dart';
import '../../core/responsive/responsive_layout.dart';
import '../theme/app_colors.dart';
import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import '../theme/app_theme_extension.dart';
import 'app_routes.dart';

/// Provider for the application router.
final routerProvider = Provider<GoRouter>((ref) {
  return createRouter();
});

/// Creates a new [GoRouter] instance.
GoRouter createRouter({String initialLocation = AppRoutes.root}) {
  return GoRouter(
    initialLocation: initialLocation,
    errorBuilder:
        (context, state) => NotFoundScreen(path: state.uri.toString()),
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.root,
        name: 'foundation',
        builder: (context, state) => const FoundationScreen(),
      ),
    ],
  );
}

/// Foundation screen for verifying theme, responsive layout, and routing.
class FoundationScreen extends StatelessWidget {
  const FoundationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nido Foundation'),
        actions: [
          IconButton(
            key: const Key('trigger_404_button'),
            icon: const Icon(Icons.bug_report_outlined),
            tooltip: 'Probar ruta desconocida (404)',
            onPressed: () => context.go('/non-existent-route'),
          ),
        ],
      ),
      body: SafeArea(
        child: ResponsiveLayout(
          compact:
              (context, breakpoint) =>
                  _CompactFoundationView(breakpoint: breakpoint),
          medium:
              (context, breakpoint) =>
                  _MediumFoundationView(breakpoint: breakpoint),
          expanded:
              (context, breakpoint) =>
                  _ExpandedFoundationView(breakpoint: breakpoint),
        ),
      ),
    );
  }
}

/// Compact composition (< 600dp). Single-column scrollable feed.
class _CompactFoundationView extends StatelessWidget {
  const _CompactFoundationView({required this.breakpoint});

  final BreakpointSize breakpoint;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: const Key('compact_foundation_view'),
      padding: AppSpacing.screenPadding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _BreakpointBadgeCard(breakpoint: breakpoint),
          const SizedBox(height: AppSpacing.cardGap),
          const _BrandOverviewCard(),
          const SizedBox(height: AppSpacing.cardGap),
          const _ThemePaletteCard(),
          const SizedBox(height: AppSpacing.cardGap),
          const _InteractiveControlsCard(),
        ],
      ),
    );
  }
}

/// Medium composition (600dp .. 839dp). Two-column balanced grid.
class _MediumFoundationView extends StatelessWidget {
  const _MediumFoundationView({required this.breakpoint});

  final BreakpointSize breakpoint;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: const Key('medium_foundation_view'),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _BreakpointBadgeCard(breakpoint: breakpoint),
          const SizedBox(height: AppSpacing.lg),
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _BrandOverviewCard()),
              SizedBox(width: AppSpacing.lg),
              Expanded(child: _ThemePaletteCard()),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          const _InteractiveControlsCard(),
        ],
      ),
    );
  }
}

/// Expanded composition (>= 840dp). Wide desktop layout with side rail
/// and multi-pane cards.
class _ExpandedFoundationView extends StatelessWidget {
  const _ExpandedFoundationView({required this.breakpoint});

  final BreakpointSize breakpoint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: const Key('expanded_foundation_view'),
      padding: const EdgeInsets.all(AppSpacing.xxl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 320,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _BreakpointBadgeCard(breakpoint: breakpoint),
                const SizedBox(height: AppSpacing.lg),
                const _BrandOverviewCard(),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.xl),
          const Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ThemePaletteCard(),
                  SizedBox(height: AppSpacing.lg),
                  _InteractiveControlsCard(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Card showing current breakpoint classification.
class _BreakpointBadgeCard extends StatelessWidget {
  const _BreakpointBadgeCard({required this.breakpoint});

  final BreakpointSize breakpoint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final width = MediaQuery.sizeOf(context).width;

    return Card(
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: const BoxDecoration(
                color: AppColors.primaryTint,
                borderRadius: AppRadii.buttonRadius,
              ),
              child: const Icon(
                Icons.devices_outlined,
                color: AppColors.primary,
                size: 24,
              ),
            ),
            const SizedBox(width: AppSpacing.screen),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Breakpoint: ${breakpoint.name.toUpperCase()}',
                    style: theme.textTheme.titleMedium,
                  ),
                  Text(
                    'Ancho: ${width.toStringAsFixed(1)} dp '
                    '(constraint-driven)',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Card introducing the foundation shell.
class _BrandOverviewCard extends StatelessWidget {
  const _BrandOverviewCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Nido App Shell', style: theme.textTheme.titleMedium),
            const SizedBox(height: AppSpacing.base),
            Text(
              'Finanzas del hogar para dos. Foundation bootstrap con Flutter, '
              'Riverpod, GoRouter y tokens de diseño Material 3.',
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

/// Card visualizing the primary color palette and category swatches.
class _ThemePaletteCard extends StatelessWidget {
  const _ThemePaletteCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final nidoExt = theme.extension<NidoThemeExtension>();

    return Card(
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Paleta de Tokens Visuales',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.cardGap),
            const Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                _ColorBadge(name: 'Primary', color: AppColors.primary),
                _ColorBadge(
                  name: 'PrimaryTint',
                  color: AppColors.primaryTint,
                  textColor: AppColors.ink,
                ),
                _ColorBadge(name: 'Accent', color: AppColors.accent),
                _ColorBadge(
                  name: 'Background',
                  color: AppColors.background,
                  textColor: AppColors.ink,
                ),
                _ColorBadge(
                  name: 'Surface',
                  color: AppColors.surface,
                  textColor: AppColors.ink,
                ),
                _ColorBadge(name: 'Danger', color: AppColors.danger),
                _ColorBadge(name: 'Warning', color: AppColors.warning),
                _ColorBadge(name: 'Success', color: AppColors.success),
              ],
            ),
            if (nidoExt != null) ...[
              const SizedBox(height: AppSpacing.screen),
              Text(
                'Category Swatches (WCAG verified):',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final color in nidoExt.categorySwatches)
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.border),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Small chip displaying a color swatch and label.
class _ColorBadge extends StatelessWidget {
  const _ColorBadge({
    required this.name,
    required this.color,
    this.textColor = Colors.white,
  });

  final String name;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.base,
      ),
      decoration: BoxDecoration(
        color: color,
        borderRadius: AppRadii.buttonRadius,
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Text(
        name,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }
}

/// Interactive button controls for testing foundation interactions.
class _InteractiveControlsCard extends StatelessWidget {
  const _InteractiveControlsCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: AppSpacing.cardInsets,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Pruebas de Router y Componentes',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.cardGap),
            Wrap(
              spacing: AppSpacing.cardGap,
              runSpacing: AppSpacing.sm,
              children: [
                FilledButton.icon(
                  icon: const Icon(Icons.check_circle_outline),
                  label: const Text('Botón Principal'),
                  onPressed: () {},
                ),
                OutlinedButton.icon(
                  icon: const Icon(Icons.refresh_outlined),
                  label: const Text('Botón Secundario'),
                  onPressed: () {},
                ),
                TextButton(
                  onPressed: () => context.go('/ruta-invalida'),
                  child: const Text('Ruta Desconocida →'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Explicit 404 / Unknown Route Screen.
class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key, required this.path});

  final String path;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      key: const Key('not_found_screen'),
      appBar: AppBar(title: const Text('Página no encontrada')),
      body: Center(
        child: Padding(
          padding: AppSpacing.screenPadding,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: AppSpacing.cardInsets,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: AppColors.danger,
                      size: 48,
                    ),
                    const SizedBox(height: AppSpacing.screen),
                    Text(
                      '404 — Ruta desconocida',
                      style: theme.textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'La ruta "$path" no existe o no está disponible.',
                      style: theme.textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    FilledButton(
                      key: const Key('return_home_button'),
                      onPressed: () => context.go(AppRoutes.root),
                      child: const Text('Volver al Inicio'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
