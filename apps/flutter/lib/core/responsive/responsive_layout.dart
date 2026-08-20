import 'package:flutter/widgets.dart';
import 'responsive_breakpoints.dart';

/// A constraint-driven builder callback for responsive layout compositions.
typedef ResponsiveWidgetBuilder =
    Widget Function(BuildContext context, BreakpointSize breakpoint);

/// A widget that selects and renders different compositions based on available
/// width constraints instead of platform checks.
///
/// Uses [LayoutBuilder] to respond dynamically to parent constraints
/// (e.g. split screens, resizable browser windows, tablets).
class ResponsiveLayout extends StatelessWidget {
  const ResponsiveLayout({
    super.key,
    required this.compact,
    this.medium,
    this.expanded,
  });

  /// Builder for compact spaces (< 600 dp). Always required.
  final ResponsiveWidgetBuilder compact;

  /// Builder for medium spaces (600 dp .. 839 dp). Falls back to [expanded]
  /// or [compact] if omitted.
  final ResponsiveWidgetBuilder? medium;

  /// Builder for expanded spaces (>= 840 dp). Falls back to [medium]
  /// or [compact] if omitted.
  final ResponsiveWidgetBuilder? expanded;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final breakpoint = ResponsiveBreakpoints.fromConstraints(constraints);

        switch (breakpoint) {
          case BreakpointSize.compact:
            return compact(context, breakpoint);
          case BreakpointSize.medium:
            if (medium != null) {
              return medium!(context, breakpoint);
            }
            if (expanded != null) {
              return expanded!(context, breakpoint);
            }
            return compact(context, breakpoint);
          case BreakpointSize.expanded:
            if (expanded != null) {
              return expanded!(context, breakpoint);
            }
            if (medium != null) {
              return medium!(context, breakpoint);
            }
            return compact(context, breakpoint);
        }
      },
    );
  }
}
