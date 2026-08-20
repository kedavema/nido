/// Sealed application errors (per `docs/flutter-architecture.md` §Errores):
/// the UI switches over these and renders its own Spanish copy — it never
/// depends on backend English strings.
sealed class AppError implements Exception {
  const AppError({required this.userMessage, this.statusCode});

  /// Safe, user-facing Spanish message (ported from the legacy client's
  /// `messageForStatus` table). Never contains backend payload content.
  final String userMessage;

  /// HTTP status that produced this error, when one exists. Kept so callers
  /// can special-case statuses that share a variant (e.g. 410 vs 409).
  final int? statusCode;

  @override
  String toString() => '$runtimeType(status: $statusCode)';
}

/// No session, or the session was rejected (401).
class UnauthenticatedError extends AppError {
  const UnauthenticatedError({int? statusCode})
    : super(
        userMessage: 'Tu sesión venció. Volvé a iniciar sesión.',
        statusCode: statusCode ?? 401,
      );
}

/// Authenticated but not allowed (403) — e.g. no active household membership.
class ForbiddenError extends AppError {
  const ForbiddenError()
    : super(
        userMessage: 'No tenés permiso para realizar esta acción.',
        statusCode: 403,
      );
}

/// The resource does not exist or is not visible to this household (404).
class NotFoundError extends AppError {
  const NotFoundError()
    : super(userMessage: 'No encontramos lo que buscabas.', statusCode: 404);
}

/// The request was rejected as invalid (400/422). The backend's generic Zod
/// 400 maps here; local validation gives richer feedback before submitting.
class ValidationError extends AppError {
  const ValidationError({int? statusCode})
    : super(
        userMessage: 'Revisá los datos e intentá de nuevo.',
        statusCode: statusCode ?? 400,
      );
}

/// The action conflicts with current state, was already performed (409), or
/// is no longer available (410, e.g. an expired invitation).
class ConflictError extends AppError {
  const ConflictError({int? statusCode})
    : super(
        userMessage:
            statusCode == 410
                ? 'La invitación venció y ya no puede usarse.'
                : 'La acción ya fue realizada o entra en conflicto con el estado actual.',
        statusCode: statusCode ?? 409,
      );
}

/// The request outlived its deadline. A timeout on a mutation is NOT proof
/// the mutation didn't happen — callers must never auto-retry mutations.
class TimeoutError extends AppError {
  const TimeoutError()
    : super(
        userMessage:
            'El servicio tardó demasiado en responder. Intentá de nuevo.',
      );
}

/// The request never got a response: DNS failure, no connectivity, blocked
/// mixed content. The transport withholds which on purpose.
class NetworkError extends AppError {
  const NetworkError()
    : super(
        userMessage:
            'No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.',
      );
}

/// The service answered but cannot serve (5xx, 429).
class UnavailableError extends AppError {
  const UnavailableError({super.statusCode})
    : super(
        userMessage:
            statusCode == 429
                ? 'Hiciste demasiados intentos. Esperá un momento y probá de nuevo.'
                : 'Nido no pudo conectarse con el servicio. Intentá de nuevo.',
      );
}

/// The caller cancelled the request (screen disposed, filter changed). Not
/// a failure to show the user — flows that race requests swallow this.
class RequestCancelledError extends AppError {
  const RequestCancelledError() : super(userMessage: '');
}

/// Anything that violates expectations: an unparseable payload, a response
/// that fails contract validation, or an unclassified status.
class UnexpectedError extends AppError {
  const UnexpectedError({super.statusCode})
    : super(userMessage: 'No pudimos completar la acción.');
}
