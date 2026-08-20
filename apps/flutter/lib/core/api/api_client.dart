import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../errors/app_error.dart';

/// Supplies the Firebase ID Token per request. Returning `null` means "no
/// session" and fails the request with [UnauthenticatedError] before any
/// bytes leave the device. Token refresh stays inside the Firebase SDK — the
/// client adds no refresh interceptor of its own.
typedef IdTokenProvider = Future<String?> Function();

/// Normal per-attempt deadline: long enough for a slow mobile link, short
/// enough that a wrong URL or dead service surfaces in seconds.
const Duration defaultRequestTimeout = Duration(seconds: 15);

/// Deadline for the single retry that follows a GET timeout, sized to
/// outlast the zero-cost profile's API cold start (~1 minute). Only the
/// retry gets this allowance — raising the normal deadline would make every
/// genuine failure take a minute to surface.
const Duration defaultColdStartTimeout = Duration(seconds: 65);

/// Foundation HTTP client (FLT-008: Dio, no Retrofit), porting the legacy
/// client's exact policies from `apps/mobile/src/api/client.ts`:
///
/// * Firebase ID Token attached per request.
/// * 15 s deadline; a GET that times out gets ONE cold-start retry with a
///   65 s deadline. Mutations are never retried automatically — a timed-out
///   mutation may still have been applied.
/// * `Idempotency-Key` sent exactly when the caller provides one (ADR 0003).
/// * Every failure is a typed [AppError]; UI copy never comes from backend
///   strings.
/// * Requests accept a [CancelToken] so screens cancel obsolete work.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required IdTokenProvider getIdToken,
    Dio? dio,
    Duration requestTimeout = defaultRequestTimeout,
    Duration coldStartTimeout = defaultColdStartTimeout,
  }) : _getIdToken = getIdToken,
       _requestTimeout = requestTimeout,
       _coldStartTimeout = coldStartTimeout,
       _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = baseUrl
      ..connectTimeout = requestTimeout
      ..responseType = ResponseType.json
      // Statuses are classified into AppError variants below; Dio must hand
      // the response over instead of wrapping non-2xx in its own exception.
      ..validateStatus = ((_) => true);
  }

  final Dio _dio;
  final IdTokenProvider _getIdToken;
  final Duration _requestTimeout;
  final Duration _coldStartTimeout;

  Future<T> get<T>(
    String path, {
    required T Function(Object? json) parse,
    Map<String, String>? query,
    CancelToken? cancelToken,
    String? logPath,
  }) async {
    try {
      return await _attempt(
        method: 'GET',
        path: path,
        parse: parse,
        query: query,
        cancelToken: cancelToken,
        timeout: _requestTimeout,
        logPath: logPath,
      );
    } on TimeoutError {
      // The screen is about to sit on a spinner far longer than usual; the
      // caller can surface "waking the service" state around this await.
      return _attempt(
        method: 'GET',
        path: path,
        parse: parse,
        query: query,
        cancelToken: cancelToken,
        timeout: _coldStartTimeout,
        logPath: logPath,
      );
    }
  }

  /// Mutations: never retried (see class doc). [idempotencyKey] must equal
  /// the body's `clientMutationId` when the endpoint uses ADR 0003.
  ///
  /// [logPath] is the route template observability sees instead of [path].
  /// REQUIRED whenever the path embeds secret material (an invite token):
  /// the real path is only ever given to the transport.
  Future<T> mutate<T>(
    String path, {
    required String method,
    required T Function(Object? json) parse,
    Object? body,
    String? idempotencyKey,
    CancelToken? cancelToken,
    String? logPath,
  }) {
    return _attempt(
      method: method,
      path: path,
      parse: parse,
      body: body,
      idempotencyKey: idempotencyKey,
      cancelToken: cancelToken,
      timeout: _requestTimeout,
      logPath: logPath,
    );
  }

  Future<T> _attempt<T>({
    required String method,
    required String path,
    required T Function(Object? json) parse,
    required Duration timeout,
    Map<String, String>? query,
    Object? body,
    String? idempotencyKey,
    CancelToken? cancelToken,
    String? logPath,
  }) async {
    final observedPath = logPath ?? path;
    final String? token;
    try {
      token = await _getIdToken();
    } catch (_) {
      // The token provider failing (SDK offline, transient auth backend
      // error) reads as a connectivity problem, not a logged-out session.
      throw const NetworkError();
    }
    if (token == null) {
      throw const UnauthenticatedError();
    }

    final stopwatch = Stopwatch()..start();
    final Response<Object?> response;
    try {
      response = await _dio
          .request<Object?>(
            path,
            data: body,
            queryParameters: query,
            cancelToken: cancelToken,
            options: Options(
              method: method,
              receiveTimeout: timeout,
              sendTimeout: timeout,
              headers: <String, Object?>{
                'Accept': 'application/json',
                'Authorization': 'Bearer $token',
                if (body != null) 'Content-Type': 'application/json',
                if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
              },
            ),
          )
          .timeout(timeout);
    } on DioException catch (error) {
      _logRequest(
        method,
        observedPath,
        status: null,
        elapsed: stopwatch.elapsed,
      );
      throw _mapTransportError(error);
    } catch (_) {
      _logRequest(
        method,
        observedPath,
        status: null,
        elapsed: stopwatch.elapsed,
      );
      throw const TimeoutError();
    }

    final status = response.statusCode ?? 0;
    _logRequest(
      method,
      observedPath,
      status: status,
      elapsed: stopwatch.elapsed,
    );

    if (status < 200 || status >= 300) {
      throw _errorForStatus(status);
    }
    if (status == 204) {
      return parse(null);
    }

    try {
      return parse(response.data);
    } on FormatException {
      // Contract violation: the response is not what `packages/contracts`
      // promises. Payload content is deliberately not included anywhere.
      throw UnexpectedError(statusCode: status);
    }
  }

  AppError _mapTransportError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const TimeoutError();
      case DioExceptionType.cancel:
        return const RequestCancelledError();
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
        return const NetworkError();
      case DioExceptionType.badResponse:
        return _errorForStatus(error.response?.statusCode ?? 0);
      case DioExceptionType.unknown:
        return const NetworkError();
    }
  }

  AppError _errorForStatus(int status) {
    switch (status) {
      case 400:
      case 422:
        return ValidationError(statusCode: status);
      case 401:
        return const UnauthenticatedError();
      case 403:
        return const ForbiddenError();
      case 404:
        return const NotFoundError();
      case 409:
      case 410:
        return ConflictError(statusCode: status);
      case 429:
        return const UnavailableError(statusCode: 429);
      default:
        if (status >= 500) {
          return UnavailableError(statusCode: status);
        }
        return UnexpectedError(statusCode: status);
    }
  }

  /// Development-only observability: method, path, status, duration. Never
  /// headers, query strings, bodies, tokens, or any financial payload
  /// (architecture §Errores/observabilidad).
  void _logRequest(
    String method,
    String path, {
    required int? status,
    required Duration elapsed,
  }) {
    if (!kDebugMode) {
      return;
    }
    debugPrint(
      '[api] $method $path -> ${status ?? 'no-response'} (${elapsed.inMilliseconds}ms)',
    );
  }
}
