-- ADR 0003 (idempotencia de movimientos offline): the idempotency tuple is
-- (actor_id, household_id, idempotency_key), not just (actor_id, idempotency_key). The M3
-- index only covered (created_by, client_mutation_id), so an idempotency key reused by the same
-- actor across two different households would incorrectly collide with the wrong household's
-- row. Replace it with a composite index scoped by household too.
DROP INDEX "transactions_created_by_client_mutation_id_key";

CREATE UNIQUE INDEX "transactions_created_by_household_id_client_mutation_id_key"
    ON "transactions" ("created_by", "household_id", "client_mutation_id")
    WHERE "client_mutation_id" IS NOT NULL;

-- client_mutation_hash: SHA-256 hex digest (computed server-side) of the semantic request
-- payload canonicalized per ADR 0003 — order of keys, transport headers, and observability
-- metadata never change it; amount, currency, exchange rate, date, and the other business
-- fields do. Used to tell a legitimate replay (same tuple, same hash) apart from a client bug
-- that reuses a key with different data (same tuple, different hash -> 409).
ALTER TABLE "transactions" ADD COLUMN "client_mutation_hash" TEXT;
