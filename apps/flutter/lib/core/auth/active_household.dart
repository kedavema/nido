import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../contracts/households.dart';
import 'session_controller.dart';
import 'session_machine.dart';

/// The household every financial screen is scoped to, or `null` while the
/// session has not resolved to one.
///
/// A narrow derived provider rather than each screen re-switching over
/// [SessionState]: a family keyed on this id rebuilds only when the household
/// actually changes, not on every session transition.
///
/// FLT-014 keeps the legacy behaviour of always taking the FIRST household
/// (see [SessionAuthenticated.activeHousehold]); the product has exactly one.
final activeHouseholdProvider = Provider<ActiveHouseholdSummary?>((ref) {
  final session = ref.watch(sessionControllerProvider);
  return session is SessionAuthenticated ? session.activeHousehold : null;
});

final activeHouseholdIdProvider = Provider<String?>((ref) {
  return ref.watch(activeHouseholdProvider)?.id;
});
