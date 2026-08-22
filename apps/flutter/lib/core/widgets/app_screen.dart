import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_spacing.dart';

/// The scrolling screen shell (`AppScreen` in `m1-ui.tsx`).
///
/// Owns four things every screen used to repeat: the background, the safe
/// area, the 16pt screen padding with a 12pt gap between blocks, and the
/// pull-to-refresh. [header] is pinned above the scroll so a title, a search
/// box or a filter row stays put while the content moves.
///
/// The bottom edge is deliberately left out of the safe area: the scroll's own
/// padding adds it, and applying both double-counts the home indicator.
class AppScreen extends StatelessWidget {
  const AppScreen({
    super.key,
    required this.children,
    this.header,
    this.onRefresh,
    this.floatingAction,
    this.centered = false,
    this.scrollKey,
  });

  final List<Widget> children;
  final Widget? header;
  final Future<void> Function()? onRefresh;

  /// Pinned bottom-right, outside the scroll, so it never scrolls away. The
  /// content gets clearance padding so the last block can escape from under it.
  final Widget? floatingAction;

  final bool centered;
  final Key? scrollKey;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final clearance = floatingAction == null ? 0.0 : 72.0;

    Widget scroll = SingleChildScrollView(
      key: scrollKey,
      physics: onRefresh == null ? null : const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.screen + bottomInset + clearance,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var index = 0; index < children.length; index++) ...[
            if (index > 0) const SizedBox(height: AppSpacing.cardGap),
            children[index],
          ],
        ],
      ),
    );

    if (centered) {
      scroll = Center(child: scroll);
    }
    if (onRefresh case final refresh?) {
      scroll = RefreshIndicator(onRefresh: refresh, child: scroll);
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Column(
              children: [
                if (header case final widget?) widget,
                Expanded(child: scroll),
              ],
            ),
            if (floatingAction case final action?)
              Positioned(
                right: AppSpacing.screen,
                bottom: AppSpacing.screen + bottomInset,
                child: action,
              ),
          ],
        ),
      ),
    );
  }
}

/// The list variant: same shell, but the content is a lazily-built list so a
/// long month does not build every row up front.
class AppListScreen extends StatelessWidget {
  const AppListScreen({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.header,
    this.onRefresh,
    this.floatingAction,
    this.separator = const SizedBox(height: AppSpacing.cardGap),
    this.listKey,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final Widget? header;
  final Future<void> Function()? onRefresh;
  final Widget? floatingAction;
  final Widget separator;
  final Key? listKey;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final clearance = floatingAction == null ? 0.0 : 72.0;

    Widget list = ListView.separated(
      key: listKey,
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.screen,
        AppSpacing.screen + bottomInset + clearance,
      ),
      itemCount: itemCount,
      separatorBuilder: (_, _) => separator,
      itemBuilder: itemBuilder,
    );

    if (onRefresh case final refresh?) {
      list = RefreshIndicator(onRefresh: refresh, child: list);
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Column(
              children: [
                if (header case final widget?) widget,
                Expanded(child: list),
              ],
            ),
            if (floatingAction case final action?)
              Positioned(
                right: AppSpacing.screen,
                bottom: AppSpacing.screen + bottomInset,
                child: action,
              ),
          ],
        ),
      ),
    );
  }
}

/// The form shell: fixed header, scrolling fields, and a call to action pinned
/// to the bottom on its own bar.
///
/// The footer is a bar rather than a button at the end of the fields because
/// the action has to stay reachable while the keyboard is up — a form whose
/// save button is somewhere below the fold is a form people abandon.
class AppFormScreen extends StatelessWidget {
  const AppFormScreen({
    super.key,
    required this.children,
    required this.footer,
    this.header,
    this.scrollKey,
  });

  final List<Widget> children;
  final Widget footer;
  final Widget? header;
  final Key? scrollKey;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (header case final widget?) widget,
            Expanded(
              child: SingleChildScrollView(
                key: scrollKey,
                padding: const EdgeInsets.all(AppSpacing.screen),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var index = 0; index < children.length; index++) ...[
                      if (index > 0) const SizedBox(height: AppSpacing.cardGap),
                      children[index],
                    ],
                  ],
                ),
              ),
            ),
            // The safe-area inset is added to the bar's own padding rather than
            // serving as it: on a device with hardware buttons it can be zero,
            // which would leave the button flush against the screen edge.
            Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              padding: EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.cardGap,
                AppSpacing.screen,
                AppSpacing.cardGap + bottomInset,
              ),
              child: footer,
            ),
          ],
        ),
      ),
    );
  }
}
