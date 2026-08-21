import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_spacing.dart';
import '../errors/error_messages.dart';
import 'inline_notice.dart';

/// Confirmation for an action that cannot be undone.
///
/// Destructive confirmations are their own widget because they have to say
/// three things every time — what will be removed, that it affects both
/// members, and that it is irreversible — and a dialog that omits any of them
/// is the one people tap through.
///
/// Returns `true` only when the user confirms and the action succeeded; the
/// dialog stays open, showing [onConfirm]'s error, when it did not.
Future<bool> showDestructiveConfirmDialog({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  required Future<void> Function() onConfirm,
  String cancelLabel = 'Cancelar',
  Key? dialogKey,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder:
        (context) => _DestructiveConfirmDialog(
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

class _DestructiveConfirmDialog extends StatefulWidget {
  const _DestructiveConfirmDialog({
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
  State<_DestructiveConfirmDialog> createState() =>
      _DestructiveConfirmDialogState();
}

class _DestructiveConfirmDialogState extends State<_DestructiveConfirmDialog> {
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
      // Reported in place rather than by closing and toasting: the row is
      // still there, and the user has to know the deletion did not happen.
      setState(() {
        _running = false;
        _error = messageForActionError(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AlertDialog(
      title: Text(widget.title, style: theme.textTheme.titleMedium),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.message, style: theme.textTheme.bodyMedium),
          if (_error case final message?) ...[
            const SizedBox(height: AppSpacing.cardGap),
            InlineNotice(message: message, tone: NoticeTone.error),
          ],
        ],
      ),
      actions: [
        TextButton(
          key: const Key('confirm_dialog_cancel'),
          onPressed: _running ? null : () => Navigator.of(context).pop(false),
          child: Text(widget.cancelLabel),
        ),
        FilledButton(
          key: const Key('confirm_dialog_confirm'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          onPressed: _running ? null : _confirm,
          child:
              _running
                  ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                  : Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
