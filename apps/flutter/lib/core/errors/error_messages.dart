import '../auth/auth_error_messages.dart';

/// The Spanish sentence a screen shows when an action fails (port of the
/// legacy `messageForActionError`).
///
/// One table serves both this and `messageForAuthError`: the legacy client
/// also had a single `messageForError` behind two names, because a failed
/// `getMe` and a failed `deleteTransaction` need the same sentence for the
/// same [AppError]. The two names exist so a call site says which surface it
/// is on — not because the mapping differs.
String messageForActionError(Object? error) => messageForAuthError(error);
