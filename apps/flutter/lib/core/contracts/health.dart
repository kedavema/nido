import 'json_reader.dart';

/// `HealthLiveResponseSchema` / `HealthReadyResponseSchema`: both are
/// `{ status: 'ok' }` strict objects.
class HealthResponse {
  const HealthResponse._();

  static HealthResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    final status = reader.string('status');
    if (status != 'ok') {
      throw ContractViolationException('status', "expected literal 'ok'");
    }
    return const HealthResponse._();
  }
}
