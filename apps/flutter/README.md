# Nido — Flutter Application (`apps/flutter`)

Universal Flutter application for Android, iOS, and Web/PWA, targeting household finances for two.

## Toolchain

- Flutter `3.29.0` with Dart `3.7.0`.
- CI pins this exact version because Dart formatter output can change between SDK releases.
- `pubspec.lock` is committed and CI enforces it; update it deliberately with the pinned SDK.

## Architecture & Decisions

- **Side-by-side coexistence** ([`FLT-002`](../../docs/flutter-migration-decisions.md)): Coexists with `apps/mobile` until parity verification is complete.
- **Feature-first architecture** ([`FLT-003`](../../docs/flutter-migration-decisions.md)): Practical folder organization without empty/ritualistic layers.
- **State management** ([`FLT-004`](../../docs/flutter-migration-decisions.md)): `flutter_riverpod` with granular providers and `ProviderScope`.
- **Routing** ([`FLT-005`](../../docs/flutter-migration-decisions.md)): `go_router` supporting deep links, direct Web refresh, and legacy route compatibility.
- **Visual Design & Material 3**: Design tokens matching Nido canonical theme (`#1C4F47`, `#F6F4EF`, etc.).
- **Constraint-based Responsive System** ([`FLT-012`](../../docs/flutter-migration-decisions.md)): `compact` (<600dp), `medium` (600..839dp), and `expanded` (>=840dp) based on available space rather than `kIsWeb`.
- **Clean Disposable Data** ([`FLT-015`](../../docs/flutter-migration-decisions.md)): Starts with clean local stores; no legacy SQLite/IndexedDB migration/drain required.

## Directory Structure

```text
apps/flutter/
  lib/
    main.dart                      # App entrypoint calling bootstrap()
    app/
      app.dart                     # MaterialApp.router with ProviderScope consumer
      bootstrap/
        bootstrap.dart             # Root bootstrap initializing ProviderScope
      router/
        app_router.dart            # go_router configuration and route definitions
        app_routes.dart            # Route path constants
      theme/
        app_theme.dart             # ThemeData (Material 3) configuration
        app_colors.dart            # Color tokens (#1C4F47, #F6F4EF, etc.)
        app_typography.dart        # Typography tokens (Bricolage Grotesque, IBM Plex Sans)
        app_spacing.dart           # Spacing tokens (base, cardGap, screen, etc.)
        app_radii.dart             # Radii tokens (card, modal, button, chip)
        app_theme_extension.dart   # NidoThemeExtension (category swatches, chart colors)
    core/
      api/
        api_client.dart            # Dio client: 15s timeout, single GET cold-start retry, typed errors
        api_config.dart            # API base URL resolution (dart-define / same-origin web)
        api_providers.dart         # Riverpod providers for clock, base URL, token, client
      contracts/
        json_reader.dart           # Strict JSON boundary reader (no loose Map<String, dynamic>)
        wire_codecs.dart           # Wire codecs for instants, local dates, months, emails
        health.dart                # Health contract DTO
        identity.dart              # AuthenticatedUser DTO
        transactions.dart          # Transaction DTOs + enums + fx cross-field rules
        monthly_summary.dart       # Monthly summary / budget DTOs
      errors/
        app_error.dart             # Sealed AppError hierarchy with Spanish UI copy
      money/
        currency.dart              # PYG (scale 0) / USD (scale 2)
        money.dart                 # Money value type (BigInt minor units, FLT-006)
        fx_rate.dart               # Exact FX rate to PYG (unscaled BigInt + scale)
        base_amount_pyg.dart       # BaseAmountPyg + ADR 0001 half-up compute + MonthlyBalancePyg
        decimal_wire.dart          # Canonical wire decimal parsing + half-up division
        money_errors.dart          # Domain errors mirrored from apps/api money.ts
      responsive/
        responsive_breakpoints.dart # Semantic breakpoint definitions (compact/medium/expanded)
        responsive_layout.dart      # LayoutBuilder wrapper for responsive composition
      time/
        local_date.dart            # LocalDate (yyyy-MM-dd, real-calendar validation)
        year_month.dart            # YearMonth (yyyy-MM, ranges, last-day clamp)
        wire_instant.dart          # UTC instant codec + legacy 15:00Z occurredAt rule
        nido_time_zone.dart        # America/Asuncion (fixed UTC-3 since DST abolition)
  test/
    app/
      app_test.dart                # App bootstrap test
      router/
        app_router_test.dart       # Initial route and 404 error screen tests
      theme/
        app_theme_test.dart        # Color and typography token tests
    core/
      responsive/
        responsive_layout_test.dart # Breakpoint switching tests
  integration_test/
    app_startup_test.dart          # E2E foundation startup test
  test_driver/
    integration_test.dart          # Host-side driver (flutter drive -d web-server)
  android/                         # Android native project (package: com.nido.mobile)
  ios/                             # iOS native project (bundle ID: com.nido.mobile)
  web/                             # Web target (index.html, manifest.json, Nido icons)
```

## Contracts & Fixtures

Dart DTOs mirror the Zod schemas in `packages/contracts`. Both sides parse the
same versioned fixtures:

- `packages/contracts/fixtures/*.json` — validated by
  `packages/contracts/test/fixtures.spec.ts` (Zod) and parsed by
  `test/core/contracts/contracts_test.dart` (Dart).
- A contract change that edits a fixture forces both clients to move in the
  same change.

Money semantics follow ADR 0001 / FLT-006: decimal strings on the wire, `BigInt`
minor units in memory, PYG scale 0, USD scale 2, and a single half-up rounding
step for USD→PYG conversion. `double` is never used for money or FX.

## Environment Strategy

Public configuration values are passed at build/run time via Dart defines without embedding secrets:

- `--dart-define=API_URL=http://localhost:3000`
- `--dart-define=FIREBASE_PROJECT_ID=nido-ci`

## Validation Commands

```bash
cd apps/flutter
flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter build web
flutter build apk --debug
flutter build ios --simulator --no-codesign   # macOS + Xcode only
```

`integration_test/` does not run under `flutter test`; CI runs it headless
against chromedriver:

```bash
chromedriver --port=4444 &
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/app_startup_test.dart \
  -d web-server --headless
```
