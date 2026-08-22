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
- **Own component set over tokens** ([`FLT-021`](../../docs/flutter-migration-decisions.md)): Material 3 is the base for layout, typography and accessibility; the visual layer is Nido's own, in `lib/core/widgets/`. Brand fonts are bundled — a family Flutter cannot resolve falls back to Roboto in silence.

## Directory Structure

```text
apps/flutter/
  lib/
    main.dart                      # App entrypoint calling bootstrap()
    app/
      app.dart                     # MaterialApp.router with ProviderScope consumer
      bootstrap/
        bootstrap.dart             # ProviderScope root + conditional Firebase init
      router/
        app_router.dart            # go_router: session redirects + route definitions
        app_routes.dart            # Route path constants (/sign-in, /onboarding, ...)
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
      auth/
        auth_client.dart           # Platform-agnostic Firebase Auth surface (test seam)
        firebase_auth_client.dart  # Real impl: Google popup (web) / google_sign_in (native)
        firebase_environment.dart  # Public Firebase config via --dart-define, validated
        session_machine.dart       # Sealed session states + destination mapping (pure)
        session_controller.dart    # Riverpod session machine (getMe dedup, reconciliation)
        auth_error_messages.dart   # Safe Spanish copy for auth failures (codes only)
        authenticated_identity.dart # Firebase-side identity value type
      contracts/
        json_reader.dart           # Strict JSON boundary reader (no loose Map<String, dynamic>)
        patch.dart                 # Patch<T>: absent vs explicit-null for PATCH requests
        wire_codecs.dart           # Wire codecs for instants, local dates, months, emails
        health.dart                # Health contract DTO
        identity.dart              # AuthenticatedUser DTO
        households.dart            # GetMe/households/members/invites DTOs (M2)
        categories.dart            # Category DTOs + kind/colour/icon rules (M3)
        payment_sources.dart       # PaymentSource DTOs + type enum (M3)
        transactions.dart          # Transaction DTOs, update patch, list query (M3)
        monthly_summary.dart       # Monthly summary / budget DTOs
      errors/
        app_error.dart             # Sealed AppError hierarchy with Spanish UI copy
        error_messages.dart        # messageForActionError for failed screen actions
      ids/
        uuid_v4.dart               # Injected UUID generator (clientMutationId, ADR 0003)
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
      widgets/                     # The design system (FLT-021)
        app_screen.dart            # AppScreen / AppListScreen / AppFormScreen shells
        screen_header.dart         # ScreenHeader, FormHeader, SectionEyebrow
        nido_card.dart             # The one raised surface (single elevation)
        action_button.dart         # ActionButton primary/secondary/danger + ActionPill
        pressable_scale.dart       # Press-scale feedback shared by every CTA
        nido_chip.dart             # NidoChip (solid select), SoftChip, ChipRow
        form_fields.dart           # NidoFormField, FormSection, NidoTextField, PickerField
        amount_field.dart          # The 44pt centred money readout
        month_stepper.dart         # Month back/forward pill
        app_bottom_sheet.dart      # Titled picker sheet with an explicit close
        confirm_dialog.dart        # Destructive confirmation sheet (fails in place)
        sync_status_pill.dart      # "Did this reach the server" — one language
        inline_notice.dart         # Tinted inline feedback box (live region)
        loading_content.dart       # Centered progress indicator + SkeletonBlock
    features/
      categories/                  # Categories & subcategories CRUD (M3)
        domain/category_tree.dart        # Root/child tree, search, chip selection
        domain/category_appearance.dart  # Icon/colour resolution and palette
      payment_sources/             # Payment sources CRUD (M3)
      transactions/                # Movements CRUD, filters and form (M3)
        domain/amount_input.dart         # Partial money/FX input, separate from Money
        domain/transaction_draft.dart    # Form state, validation, request building
        domain/transaction_filters.dart  # Kind/category filters and chips
        domain/movement_format.dart      # Day grouping, signed amounts, Spanish dates
    testing/
      session_fakes.dart           # Auth/household doubles (importable from integration_test)
      finance_fakes.dart           # Catalog/transaction doubles and builders (M3)
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
    transactions_flow_test.dart    # E2E M3: create a movement, legacy URL redirects
  test_driver/
    integration_test.dart          # Host-side driver (flutter drive -d web-server)
  assets/
    fonts/                         # Bricolage Grotesque + IBM Plex Sans (OFL 1.1)
  android/                         # Android native project (package: com.nido.mobile)
  ios/                             # iOS native project (bundle ID: com.nido.mobile)
  web/                             # Web target (index.html, manifest.json, Nido icons)
```

## Contracts & Fixtures

Dart DTOs mirror the Zod schemas in `packages/contracts`. Both sides parse the
same versioned fixtures:

- `packages/contracts/fixtures/*.json` — validated by
  `packages/contracts/test/fixtures.spec.ts` (Zod) and parsed by the Dart
  tests under `test/core/contracts/`.
- A contract change that edits a fixture forces both clients to move in the
  same change.

Money semantics follow ADR 0001 / FLT-006: decimal strings on the wire, `BigInt`
minor units in memory, PYG scale 0, USD scale 2, and a single half-up rounding
step for USD→PYG conversion. `double` is never used for money or FX.

## Environment Strategy

Public configuration values are passed at build/run time via Dart defines without embedding secrets
(they mirror the legacy `EXPO_PUBLIC_*` values; Firebase web API keys are public identifiers):

- `--dart-define=API_URL=http://localhost:3000`
- `--dart-define=FIREBASE_API_KEY=...`
- `--dart-define=FIREBASE_AUTH_DOMAIN=...` (Web only)
- `--dart-define=FIREBASE_PROJECT_ID=...`
- `--dart-define=FIREBASE_APP_ID=...`
- `--dart-define=FIREBASE_MESSAGING_SENDER_ID=...`
- `--dart-define=GOOGLE_WEB_CLIENT_ID=...` (the audience the API verifies)
- `--dart-define=GOOGLE_IOS_CLIENT_ID=...` (iOS only — iOS requires its own NEW
  Firebase/Google OAuth configuration; Android/web values do not carry over)

A build without a complete Firebase configuration still boots and resolves the
session to a recoverable error naming the missing keys. Session material
persists via each platform SDK's own storage (Keychain on iOS, app-private
storage on Android, Firebase browser persistence on Web) — never shared
preferences, never a JavaScript "secure storage" simulation. iOS deployment
target is 13.0 (required by `firebase_auth`).

## Authentication & Session (M2)

`sessionControllerProvider` exposes the single session machine
(`initializing / unauthenticated / authenticated-without-household /
authenticated-with-household / recoverable-error`, ported from
`apps/mobile/src/auth/session-machine.ts`). go_router redirects read only the
resolved state (pure, idempotent — no request duplication, no route
oscillation); unresolved states render in place through `SessionGate`.
Invite tokens are never logged: `/v1/invites/:token/accept` is observed only
as its route template, and the one-use token is shown exactly once for manual
delivery.

## Design System

`lib/core/widgets/` holds the components `docs/flutter-architecture.md` §Design system enumerates,
and every screen composes from them rather than from stock Material widgets
([`FLT-021`](../../docs/flutter-migration-decisions.md)).

Two things were wrong before it existed, and both are worth remembering:

- **The brand fonts were not in the app.** `AppTypography` named `Bricolage Grotesque` and
  `IBM Plex Sans`, but `pubspec.yaml` declared no families and there were no assets. Flutter does
  not fail on a family it cannot resolve — it falls back to Roboto silently, so every screen
  rendered in the platform default. The faces now live in `assets/fonts/` (the same ones
  `apps/mobile` loads through `@expo-google-fonts/*`, SIL OFL 1.1, licences beside them) and a
  widget test asserts the theme still resolves them.
- **Material components bring their own decisions.** Tinted elevations, ripples, shapes, densities
  and disabled states that fight the token set. `ChoiceChip` in particular tints both states at low
  contrast, where these rows need the chosen chip to read at a glance.

Material still does the work it is good at underneath: `InkWell`, `TextField`, `Divider`,
`CircleAvatar`, semantics and focus. What the design system owns is the _look_: one elevation, one
button with three roles, one chip, one sheet, one screen shell with a footer that never hides under
the keyboard.

## Core Financial Flows (M3)

Catalogs (`/categories`, `/payment-sources`) and movements (`/transactions`,
`/transactions/new`, `/transactions/:id`, `/transactions/:id/edit`). Online
only — the offline queue is M4 ([`FLT-019`](../../docs/flutter-migration-decisions.md)).

- **Money-safe forms.** A half-typed amount is an `AmountInput`, not a `Money`:
  it becomes one only when it parses. PYG accepts digits only (scale 0), USD a
  single comma capped at two decimals (scale 2), and the FX rate its own four.
  USD requires a rate; PYG must not carry one. The live `≈ Gs.` preview runs
  the same single half-up step the server applies (ADR 0001), so it matches
  what gets persisted. `double` appears nowhere.
- **Idempotency from the start.** Every create sends a `clientMutationId` with
  a matching `Idempotency-Key` (ADR 0003). M3 has no queue, but a create whose
  response was lost is unsafe to retry without one.
- **Cancellation.** Month, kind and search are the family key of
  `transactionsProvider`; changing any of them disposes the previous provider
  and its `CancelToken` aborts the request in flight, so a slow earlier
  response cannot land after a faster later one. The category filter is
  deliberately _not_ in the key — the endpoint matches `categoryId` exactly, so
  selecting a root is resolved over the response instead of refetching.
- **No pagination, stated.** `GET /transactions` has no page parameter: a query
  returns every matching row. The list says so under the last group rather than
  implying a boundary that does not exist.
- **Legacy URLs.** `/movimientos`, `/nuevo-gasto` and `/movimiento/:id` redirect
  to their canonical routes, carrying `:id` and the query string
  ([`FLT-020`](../../docs/flutter-migration-decisions.md)).
- **Deliberate differences from legacy**, each with its own decision: the
  currency selector that makes USD creation reachable
  ([`FLT-016`](../../docs/flutter-migration-decisions.md)), uniform rejection of
  a zero amount ([`FLT-017`](../../docs/flutter-migration-decisions.md)), and a
  detail screen labelled by the movement's actual type
  ([`FLT-018`](../../docs/flutter-migration-decisions.md)).

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
for target in \
  integration_test/app_startup_test.dart \
  integration_test/transactions_flow_test.dart
do
  flutter drive \
    --driver=test_driver/integration_test.dart \
    --target="$target" \
    -d web-server --headless
done
```
