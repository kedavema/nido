import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_radii.dart';
import '../../app/theme/app_spacing.dart';
import '../errors/error_messages.dart';
import 'action_button.dart';
import 'inline_notice.dart';

/// Confirmation for an action that cannot be undone.
///
/// A bottom sheet rather than an `AlertDialog`: the two buttons land where the
/// thumb already is, and the panel matches every other sheet in the app. It
/// has to say three things every time — what will be removed, that it affects
/// both members, and that it is irreversible — because a dialog that omits any
/// of them is the one people tap through.
///
/// Returns `true` only when the user confirms *and* the action succeeded; the
/// sheet stays open, showing [onConfirm]'s error, when it did not — the row is
/// still there and the user has to know the deletion never happened.
Future<bool> showDestructiveConfirmDialog({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  required Future<void> Function() onConfirm,
  String cancelLabel = 'Cancelar',
  Key? dialogKey,
}) async {
  final confirmed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0x8C141C19),
    builder:
        (context) => _DestructiveConfirmSheet(
          key: dialogKey,
          title: title,
          message: message,
          confirmLabel: confirmLabel,
          cancelLabel: cancelLabel,
          onConfirm: onConfirm,
        ),
  );
  return confirmed ?? false;
}

class _DestructiveConfirmSheet extends StatefulWidget {
  const _DestructiveConfirmSheet({
    super.key,
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.onConfirm,
  });

  final String title;
  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final Future<void> Function() onConfirm;

  @override
  State<_DestructiveConfirmSheet> createState() =>
      _DestructiveConfirmSheetState();
}

class _DestructiveConfirmSheetState extends State<_DestructiveConfirmSheet> {
  bool _running = false;
  String? _error;

  Future<void> _confirm() async {
    setState(() {
      _running = true;
      _error = null;
    });
    try {
      await widget.onConfirm();
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _running = false;
        _error = messageForActionError(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(AppRadii.modal),
          topRight: Radius.circular(AppRadii.modal),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.lg,
        AppSpacing.screen,
        AppSpacing.screen + bottomInset,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(widget.title, style: theme.textTheme.titleMedium),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(widget.message, style: theme.textTheme.bodyMedium),
          if (_error case final message?) ...[
            const SizedBox(height: AppSpacing.cardGap),
            InlineNotice(message: message, tone: NoticeTone.error),
          ],
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(
                child: ActionButton(
                  key: const Key('confirm_dialog_cancel'),
                  label: widget.cancelLabel,
                  variant: ActionButtonVariant.secondary,
                  onPressed:
                      _running ? null : () => Navigator.of(context).pop(false),
                ),
              ),
              const SizedBox(width: AppSpacing.cardGap),
              Expanded(
                child: ActionButton(
                  key: const Key('confirm_dialog_confirm'),
                  label: widget.confirmLabel,
                  variant: ActionButtonVariant.danger,
                  loading: _running,
                  onPressed: _running ? null : _confirm,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
