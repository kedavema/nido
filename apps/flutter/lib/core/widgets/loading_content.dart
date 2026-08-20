import 'package:flutter/material.dart';

import '../../app/theme/app_spacing.dart';

/// Centered progress indicator with an optional label.
class LoadingContent extends StatelessWidget {
  const LoadingContent({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          if (label != null) ...[
            const SizedBox(height: AppSpacing.cardGap),
            Text(label!, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}
