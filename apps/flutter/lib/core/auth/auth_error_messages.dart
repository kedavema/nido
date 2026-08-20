import 'package:firebase_auth/firebase_auth.dart';

import '../contracts/json_reader.dart';
import '../errors/app_error.dart';

/// Firebase Auth codes worth naming, because each one has a different fix and
/// the user (or the person reading their screenshot) can act on knowing which
/// it was (ported from `apps/mobile/src/auth/error-message.ts`). Keys are the
/// FlutterFire codes, without the web SDK's `auth/` prefix.
///
/// Only the `code` is ever surfaced — never `error.message`, which Firebase
/// populates with request detail that can carry a token.
const Map<String, String> _firebaseAuthMessages = <String, String>{
  'unauthorized-domain': 'Este dominio no está habilitado para iniciar sesión.',
  'network-request-failed':
      'No pudimos conectarnos con el servicio de inicio de sesión. '
      'Revisá tu conexión e intentá de nuevo.',
  'popup-blocked':
      'El navegador bloqueó la ventana de inicio de sesión. '
      'Permitila e intentá de nuevo.',
  'too-many-requests':
      'Hiciste demasiados intentos. Esperá un momento y probá de nuevo.',
  'user-disabled': 'Esta cuenta está deshabilitada.',
  'invalid-api-key': 'La clave de Firebase no es válida.',
};

String _normalizedAuthCode(String code) =>
    code.startsWith('auth/') ? code.substring('auth/'.length) : code;

/// The error's runtime type, when it adds anything. The message is withheld
/// on purpose — an unrecognized error is exactly the one whose message we
/// have not vetted for tokens or payload detail.
String _unknownErrorDetail(Object? error) {
  if (error is Error) {
    return ' (${error.runtimeType})';
  }
  return '';
}

/// The single place an arbitrary thrown value becomes a sentence the user
/// reads (port of `messageForError`). Every branch either carries a cause the
/// user can act on, or names the error well enough that a screenshot is
/// diagnosable — and no branch ever includes upstream message content.
String messageForAuthError(Object? error) {
  // AppError copy is already user-facing Spanish (includes ConfigurationError,
  // the port of PublicEnvironmentError).
  if (error is AppError) {
    return error.userMessage;
  }

  // A contract violation is the moral twin of the legacy ZodError branch.
  if (error is ContractViolationException) {
    return 'Revisá los datos e intentá de nuevo.';
  }

  if (error is FirebaseAuthException) {
    final code = _normalizedAuthCode(error.code);
    return _firebaseAuthMessages[code] ??
        'No pudimos iniciar sesión. (auth/$code)';
  }

  return 'Ocurrió un error inesperado. Intentá de nuevo.'
      '${_unknownErrorDetail(error)}';
}
