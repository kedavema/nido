# AGENTS.md

## Repository map

- `apps/mobile`: Expo Router app for Android and web/PWA; M1 owns Firebase client auth and the
  minimal household/invitation UI.
- `apps/api`: NestJS modular API with Firebase Admin identity, Prisma/PostgreSQL, and the M1
  auth/users/households modules.
- `packages/contracts`: shared Zod boundary contracts.
- `packages/domain-types`: framework-free domain primitives.
- `packages/config`: shared ESLint, Prettier, and TypeScript configuration.
- `docs/adr`: accepted architecture decisions; `docs/system-design.md` remains the domain source.
- `docs/runbooks`: reproducible operational and manual-verification procedures.
- `design/nido-v0.3`: visual reference only. Never copy its generated runtime or inline styles.

## Official commands

Use Node 24 and the pinned pnpm version. Run commands from the repository root.

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build` or `pnpm build:web`
- `pnpm build:android`
- `pnpm dev:api` or `pnpm dev:mobile`
- `pnpm config:mobile`, `pnpm doctor:mobile`
- `pnpm compose:config`, `pnpm compose:up`, `pnpm compose:down`
- `pnpm db:generate`, `pnpm db:migrate:dev`, `pnpm db:migrate:deploy`, `pnpm db:migrate:status`
- `pnpm test:integration` with a disposable PostgreSQL database in `TEST_DATABASE_URL`

## Conventions and boundaries

- TypeScript is strict. Keep Zod validation at system boundaries and money out of JavaScript `number` values.
- Tenant-owned work must be scoped by `household_id`; never trust a client household identifier without membership resolution.
- Verify Firebase ID Tokens server-side, resolve the local user from verified claims, normalize identity/invitation emails, and require active membership for household resources.
- Persist only invitation-token hashes. Never log or recover plaintext invitation tokens; the M1 response may expose a newly generated token once for manual delivery.
- Keep Prisma entities inside API infrastructure and make household creation/invite acceptance atomic.
- `EXPO_PUBLIC_*` values are public bundle configuration, never secrets. Firebase Admin uses Application Default Credentials from an external `GOOGLE_APPLICATION_CREDENTIALS` path; never commit service-account JSON.
- Keep mobile free of Prisma/API implementation imports and keep pure packages framework-free.
- Do not log financial payloads, descriptions, tokens, or imported file content.
- M1 ends at auth, users, households, active membership, and one-use invitations. It excludes categories, payment sources, financial CRUD, offline queues, budgets, recurrence, notifications, imports, reports, deployment, and future-milestone placeholders.
- Do not edit generated/reference files under `design/`; its colocated README may document provenance and canonical scope. Do not edit unrelated files under `.agents/`.

## Acceptance and done

M1 is done only when migrations apply to a clean PostgreSQL database; unit/E2E and PostgreSQL integration tests cover authentication, owner creation, membership authorization, cross-household denial, invitation email/expiry/reuse/concurrency, and token hashing; lint, format, typecheck, tests, workspace build, web/Android exports, Expo doctor/config, API live/ready behavior, and Compose pass. Real Firebase login remains a separately reported manual check unless project credentials and both web/Android flows were actually exercised. README, environment examples, migrations, and this file must match the implementation. Review the full diff before committing. Never commit, push, open a PR, deploy, or begin M2 without explicit authorization.
