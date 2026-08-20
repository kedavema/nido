import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nido/core/api/api_client.dart';
import 'package:nido/core/errors/app_error.dart';

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options, int call) handler;
  final List<RequestOptions> requests = [];

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return handler(options, requests.length);
  }
}

ResponseBody _json(String body, int status) {
  return ResponseBody.fromString(
    body,
    status,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

ApiClient _client(
  _FakeAdapter adapter, {
  Future<String?> Function()? getIdToken,
  Duration requestTimeout = const Duration(milliseconds: 100),
  Duration coldStartTimeout = const Duration(milliseconds: 400),
}) {
  return ApiClient(
    baseUrl: 'https://api.nido.test',
    getIdToken: getIdToken ?? () async => 'token-123',
    dio: Dio()..httpClientAdapter = adapter,
    requestTimeout: requestTimeout,
    coldStartTimeout: coldStartTimeout,
  );
}

void main() {
  group('authentication preconditions', () {
    test(
      'a null token fails as unauthenticated before any request is sent',
      () async {
        final adapter = _FakeAdapter((_, __) async => _json('{}', 200));
        final client = _client(adapter, getIdToken: () async => null);

        await expectLater(
          client.get('/v1/me', parse: (json) => json),
          throwsA(isA<UnauthenticatedError>()),
        );
        expect(adapter.requests, isEmpty);
      },
    );

    test('a token provider failure reads as a network problem', () async {
      final adapter = _FakeAdapter((_, __) async => _json('{}', 200));
      final client = _client(
        adapter,
        getIdToken: () async => throw Exception('sdk offline'),
      );

      await expectLater(
        client.get('/v1/me', parse: (json) => json),
        throwsA(isA<NetworkError>()),
      );
      expect(adapter.requests, isEmpty);
    });

    test('the bearer token and accept header ride every request', () async {
      final adapter = _FakeAdapter((_, __) async => _json('{"ok":true}', 200));
      final client = _client(adapter);

      await client.get('/v1/me', parse: (json) => json);

      final request = adapter.requests.single;
      expect(request.headers['Authorization'], 'Bearer token-123');
      expect(request.headers['Accept'], 'application/json');
    });
  });

  group('status mapping to sealed AppError', () {
    Future<AppError> errorFor(int status) async {
      final adapter = _FakeAdapter((_, __) async => _json('{}', status));
      try {
        await _client(adapter).get('/v1/x', parse: (json) => json);
        fail('expected an AppError for status $status');
      } on AppError catch (error) {
        return error;
      }
    }

    test('maps each contractual status to its variant', () async {
      expect(await errorFor(400), isA<ValidationError>());
      expect(await errorFor(422), isA<ValidationError>());
      expect(await errorFor(401), isA<UnauthenticatedError>());
      expect(await errorFor(403), isA<ForbiddenError>());
      expect(await errorFor(404), isA<NotFoundError>());
      expect(await errorFor(409), isA<ConflictError>());
      expect(await errorFor(410), isA<ConflictError>());
      expect(await errorFor(429), isA<UnavailableError>());
      expect(await errorFor(500), isA<UnavailableError>());
      expect(await errorFor(503), isA<UnavailableError>());
      expect(await errorFor(418), isA<UnexpectedError>());
    });

    test('keeps the status for shared variants (409 vs 410)', () async {
      expect((await errorFor(410)).statusCode, 410);
      expect((await errorFor(409)).statusCode, 409);
    });

    test('user messages are Spanish copy, never backend strings', () async {
      final error = await errorFor(403);
      expect(error.userMessage, 'No tenés permiso para realizar esta acción.');
    });
  });

  group('timeouts and the single GET cold-start retry', () {
    test(
      'a GET that times out is retried once with the long deadline',
      () async {
        final adapter = _FakeAdapter((options, call) async {
          if (call == 1) {
            await Future<void>.delayed(const Duration(milliseconds: 250));
            return _json('{"late":true}', 200);
          }
          return _json('{"warm":true}', 200);
        });
        final client = _client(adapter);

        final result = await client.get('/v1/slow', parse: (json) => json);

        expect(result, {'warm': true});
        expect(adapter.requests, hasLength(2));
      },
    );

    test(
      'a GET that times out twice surfaces a timeout error, not a third try',
      () async {
        final adapter = _FakeAdapter((_, __) async {
          await Future<void>.delayed(const Duration(milliseconds: 600));
          return _json('{}', 200);
        });
        final client = _client(adapter);

        await expectLater(
          client.get('/v1/slow', parse: (json) => json),
          throwsA(isA<TimeoutError>()),
        );
        expect(adapter.requests, hasLength(2));

        // Let the delayed fake responses complete so nothing leaks across tests.
        await Future<void>.delayed(const Duration(milliseconds: 700));
      },
    );

    test('a mutation that times out is NEVER retried', () async {
      final adapter = _FakeAdapter((_, __) async {
        await Future<void>.delayed(const Duration(milliseconds: 250));
        return _json('{}', 200);
      });
      final client = _client(adapter);

      await expectLater(
        client.mutate(
          '/v1/tx',
          method: 'POST',
          body: const {'a': 1},
          parse: (json) => json,
        ),
        throwsA(isA<TimeoutError>()),
      );
      expect(adapter.requests, hasLength(1));

      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
  });

  group('mutations', () {
    test(
      'sends the Idempotency-Key header exactly when provided (ADR 0003)',
      () async {
        final adapter = _FakeAdapter(
          (_, __) async => _json('{"ok":true}', 201),
        );
        final client = _client(adapter);

        await client.mutate(
          '/v1/households/h/transactions',
          method: 'POST',
          body: const {'clientMutationId': 'abc'},
          idempotencyKey: 'abc',
          parse: (json) => json,
        );
        await client.mutate(
          '/v1/households/h/transactions',
          method: 'POST',
          body: const {'x': 1},
          parse: (json) => json,
        );

        expect(adapter.requests.first.headers['Idempotency-Key'], 'abc');
        expect(
          adapter.requests.last.headers.containsKey('Idempotency-Key'),
          isFalse,
        );
      },
    );

    test('a 204 no-content resolves through parse(null)', () async {
      final adapter = _FakeAdapter(
        (_, __) async => ResponseBody.fromString('', 204),
      );
      final client = _client(adapter);

      final result = await client.mutate(
        '/v1/households/h/transactions/t',
        method: 'DELETE',
        parse: (json) => json == null,
      );
      expect(result, isTrue);
    });
  });

  group('response handling', () {
    test(
      'a payload that violates the contract is an UnexpectedError',
      () async {
        final adapter = _FakeAdapter(
          (_, __) async => _json('{"weird": []}', 200),
        );
        final client = _client(adapter);

        await expectLater(
          client.get(
            '/v1/me',
            parse: (json) => throw const FormatException('contract violation'),
          ),
          throwsA(isA<UnexpectedError>()),
        );
      },
    );

    test('cancellation surfaces as RequestCancelledError', () async {
      final adapter = _FakeAdapter((_, __) async {
        await Future<void>.delayed(const Duration(milliseconds: 300));
        return _json('{}', 200);
      });
      final client = _client(
        adapter,
        requestTimeout: const Duration(seconds: 5),
      );
      final cancelToken = CancelToken();

      final pending = expectLater(
        client.get('/v1/slow', parse: (json) => json, cancelToken: cancelToken),
        throwsA(isA<RequestCancelledError>()),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));
      cancelToken.cancel();
      await pending;
    });
  });
}
