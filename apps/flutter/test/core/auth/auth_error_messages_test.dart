import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/auth/auth_error_messages.dart';
import 'package:nido/core/contracts/json_reader.dart';
import 'package:nido/core/errors/app_error.dart';

/// Port of `apps/mobile/src/auth/error-message.test.ts`. FlutterFire codes
/// drop the web SDK's `auth/` prefix, so both spellings are covered.
void main() {
  FirebaseAuthException firebaseError(
    String code, {
    String message = 'Firebase: internal detail (auth/xxx).',
  }) => FirebaseAuthException(code: code, message: message);

  group('messageForAuthError', () {
    test('passes an AppError message through, it is already user-facing', () {
      expect(
        messageForAuthError(const NotFoundError()),
        'No encontramos lo que buscabas.',
      );
    });

    test('passes a ConfigurationError through, naming the invalid keys', () {
      final message = messageForAuthError(
        ConfigurationError(['FIREBASE_API_KEY', 'GOOGLE_WEB_CLIENT_ID']),
      );

      expect(message, contains('FIREBASE_API_KEY'));
      expect(message, contains('GOOGLE_WEB_CLIENT_ID'));
    });

    test('turns a contract violation into validation guidance', () {
      expect(
        messageForAuthError(ContractViolationException('user', 'expected')),
        'Revisá los datos e intentá de nuevo.',
      );
    });

    for (final (code, expected) in const [
      (
        'unauthorized-domain',
        'Este dominio no está habilitado para iniciar sesión.',
      ),
      (
        'network-request-failed',
        'No pudimos conectarnos con el servicio de inicio de sesión. '
            'Revisá tu conexión e intentá de nuevo.',
      ),
      (
        'popup-blocked',
        'El navegador bloqueó la ventana de inicio de sesión. '
            'Permitila e intentá de nuevo.',
      ),
      (
        'too-many-requests',
        'Hiciste demasiados intentos. Esperá un momento y probá de nuevo.',
      ),
      ('user-disabled', 'Esta cuenta está deshabilitada.'),
      ('invalid-api-key', 'La clave de Firebase no es válida.'),
    ]) {
      test('names the cause behind $code', () {
        expect(messageForAuthError(firebaseError(code)), expected);
        expect(messageForAuthError(firebaseError('auth/$code')), expected);
      });
    }

    test('keeps an unmapped Firebase code so a screenshot is diagnosable', () {
      expect(
        messageForAuthError(firebaseError('operation-not-allowed')),
        'No pudimos iniciar sesión. (auth/operation-not-allowed)',
      );
    });

    test('never surfaces the Firebase message, mapped or not', () {
      const secret = 'Firebase: token=eyJhbGciOi.LEAKED (auth/internal).';

      expect(
        messageForAuthError(
          firebaseError('unauthorized-domain', message: secret),
        ),
        isNot(contains('LEAKED')),
      );
      expect(
        messageForAuthError(firebaseError('internal-error', message: secret)),
        isNot(contains('LEAKED')),
      );
    });

    test('names an unknown error by type without repeating its message', () {
      expect(
        messageForAuthError(StateError('undefined is not a function')),
        'Ocurrió un error inesperado. Intentá de nuevo. (StateError)',
      );
    });

    test('adds no parenthetical when the type says nothing', () {
      expect(
        messageForAuthError(Exception('boom')),
        'Ocurrió un error inesperado. Intentá de nuevo.',
      );
      expect(
        messageForAuthError('a thrown string'),
        'Ocurrió un error inesperado. Intentá de nuevo.',
      );
      expect(
        messageForAuthError(null),
        'Ocurrió un error inesperado. Intentá de nuevo.',
      );
    });
  });
}
