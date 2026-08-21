import 'package:flutter/material.dart';

/// How far a control shrinks while held, and how long it takes to get there
/// (`PRESS_SCALE` / `PRESS_DURATION_MS` in `apps/mobile/src/components/m1-ui.tsx`).
const double _pressScale = 0.97;
const Duration _pressDuration = Duration(milliseconds: 90);

/// A tappable surface that dips slightly under the finger.
///
/// The scale is what makes a control feel physical rather than like a link: it
/// starts the moment the touch lands, before any navigation or network work,
/// so the app answers instantly even when the action behind it does not. Every
/// CTA routes through here, so the feedback lands everywhere at once instead of
/// screen by screen.
class PressableScale extends StatefulWidget {
  const PressableScale({
    super.key,
    required this.child,
    required this.onPressed,
    this.semanticLabel,
    this.selected,
    this.busy,
  });

  final Widget child;

  /// `null` disables the control: no scale, no tap, and the semantics say so.
  final VoidCallback? onPressed;

  final String? semanticLabel;
  final bool? selected;
  final bool? busy;

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _pressDuration,
    lowerBound: 0,
    upperBound: 1,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _enabled => widget.onPressed != null;

  void _press() => _controller.forward();
  void _release() => _controller.reverse();

  @override
  Widget build(BuildContext context) {
    // Respect the platform's reduce-motion setting: an animation whose whole
    // job is a physical flourish is exactly what that setting turns off.
    final animate = !MediaQuery.disableAnimationsOf(context);

    return Semantics(
      button: true,
      enabled: _enabled,
      label: widget.semanticLabel,
      selected: widget.selected,
      child: GestureDetector(
        onTap: widget.onPressed,
        onTapDown: _enabled && animate ? (_) => _press() : null,
        onTapUp: _enabled && animate ? (_) => _release() : null,
        onTapCancel: _enabled && animate ? _release : null,
        behavior: HitTestBehavior.opaque,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Transform.scale(
              scale: 1 - _controller.value * (1 - _pressScale),
              child: child,
            );
          },
          child: widget.child,
        ),
      ),
    );
  }
}
