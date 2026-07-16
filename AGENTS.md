# AGENTS.md

## Repository map

- `apps/mobile`: Expo Router app for Android and web/PWA.
- `apps/api`: NestJS modular API; M0 contains health checks only.
- `packages/contracts`: shared Zod boundary contracts.
- `packages/domain-types`: framework-free domain primitives.
- `packages/config`: shared ESLint, Prettier, and TypeScript configuration.
- `docs/adr`: accepted architecture decisions; `docs/system-design.md` remains the domain source.
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

## Conventions and boundaries

- TypeScript is strict. Keep Zod validation at system boundaries and money out of JavaScript `number` values.
- Tenant-owned work must be scoped by `household_id`; never trust a client household identifier without membership resolution.
- Keep mobile free of Prisma/API implementation imports and keep pure packages framework-free.
- Do not log financial payloads, descriptions, tokens, or imported file content.
- M0 excludes auth, users/households, financial persistence or CRUD, offline queues, budgets, recurrence, notifications, imports, reports, deployment, and future-milestone placeholders.
- Do not edit generated/reference files under `design/`; its colocated README may document provenance and canonical scope. Do not edit unrelated files under `.agents/`.

## Acceptance and done

M0 is done only when frozen installation, lint, format check, typecheck, tests, workspace build, web and Android exports, Expo doctor/config validation, API startup/health, and Compose/PostgreSQL validation pass. README, ADRs, and this file must match the implemented commands and scope. Review the full diff before committing. Never commit, push, open a PR, deploy, or begin M1 without explicit authorization.
