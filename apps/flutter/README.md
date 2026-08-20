# Nido — Flutter Application (`apps/flutter`)

Universal Flutter application for Android, iOS, and Web/PWA, targeting household finances for two.

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
      responsive/
        responsive_breakpoints.dart # Semantic breakpoint definitions (compact/medium/expanded)
        responsive_layout.dart      # LayoutBuilder wrapper for responsive composition
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
  android/                         # Android native project (package: com.nido.mobile)
  ios/                             # iOS native project (bundle ID: com.nido.mobile)
  web/                             # Web target (index.html, manifest.json)
```

## Environment Strategy

Public configuration values are passed at build/run time via Dart defines without embedding secrets:

- `--dart-define=API_URL=http://localhost:3000`
- `--dart-define=FIREBASE_PROJECT_ID=nido-ci`

## Validation Commands

```bash
cd apps/flutter
flutter pub get
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter build web
```
