import 'package:flutter/widgets.dart';

/// Semantic responsive breakpoint classifications.
///
/// Follows Material 3 window size classes:
/// - [compact]: Phone in portrait, narrow split-screen (< 600 dp).
/// - [medium]: Tablet in portrait, foldable, large phone in landscape
///   (600 dp .. 839 dp).
/// - [expanded]: Tablet in landscape, desktop browser, large monitor
///   (>= 840 dp).
enum BreakpointSize {
  compact,
  medium,
  expanded;

  bool get isCompact => this == BreakpointSize.compact;
  bool get isMedium => this == BreakpointSize.medium;
  bool get isExpanded => this == BreakpointSize.expanded;
}

/// Constants defining breakpoint thresholds.
class ResponsiveBreakpoints {
  const ResponsiveBreakpoints._();

  /// Maximum width for compact layouts.
  static const double compactMaxWidth = 599.0;

  /// Maximum width for medium layouts.
  static const double mediumMaxWidth = 839.0;

  /// Minimum width for expanded layouts.
  static const double expandedMinWidth = 840.0;

  /// Classifies width into [BreakpointSize].
  static BreakpointSize fromWidth(double width) {
    if (width <= compactMaxWidth) {
      return BreakpointSize.compact;
    }
    if (width <= mediumMaxWidth) {
      return BreakpointSize.medium;
    }
    return BreakpointSize.expanded;
  }

  /// Classifies [BoxConstraints] into [BreakpointSize].
  static BreakpointSize fromConstraints(BoxConstraints constraints) {
    return fromWidth(constraints.maxWidth);
  }

  /// Classifies [BuildContext] size into [BreakpointSize].
  static BreakpointSize of(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return fromWidth(width);
  }
}
