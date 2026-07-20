-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "transaction_currency" AS ENUM ('PYG', 'USD');

-- CreateEnum
CREATE TYPE "transaction_origin" AS ENUM ('MANUAL', 'IMPORT', 'RECURRING');

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "transaction_currency" NOT NULL,
    "fx_rate_to_base" DECIMAL(18,4),
    "base_amount_pyg" DECIMAL(18,0) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "local_date" DATE NOT NULL,
    "category_id" UUID NOT NULL,
    "payment_source_id" UUID,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "origin" "transaction_origin" NOT NULL DEFAULT 'MANUAL',
    "source_occurrence_id" UUID,
    "external_reference" TEXT,
    "client_mutation_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_source_occurrence_id_key" ON "transactions"("source_occurrence_id");

-- CreateIndex
CREATE INDEX "transactions_household_id_local_date_idx" ON "transactions"("household_id", "local_date" DESC);

-- CreateIndex
CREATE INDEX "transactions_household_id_category_id_local_date_idx" ON "transactions"("household_id", "category_id", "local_date");

-- CreateIndex
CREATE INDEX "transactions_household_id_payment_source_id_local_date_idx" ON "transactions"("household_id", "payment_source_id", "local_date");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_source_id_fkey" FOREIGN KEY ("payment_source_id") REFERENCES "payment_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Idempotent client retries and import de-duplication (hand-written; Prisma cannot express
-- partial unique indexes).
-- - transactions_created_by_client_mutation_id_key: one row per (created_by, client_mutation_id)
--   when client_mutation_id is set, so a retried mutation from the same author is a no-op.
-- - transactions_household_payment_source_external_reference_key: one row per
--   (household_id, payment_source_id, external_reference) when external_reference is set, so an
--   import cannot double-book the same external record for the same payment source.
CREATE UNIQUE INDEX "transactions_created_by_client_mutation_id_key"
    ON "transactions" ("created_by", "client_mutation_id")
    WHERE "client_mutation_id" IS NOT NULL;

CREATE UNIQUE INDEX "transactions_household_payment_source_external_reference_key"
    ON "transactions" ("household_id", "payment_source_id", "external_reference")
    WHERE "external_reference" IS NOT NULL;

-- Category/payment-source consistency enforcement (hand-written; Prisma cannot express it
-- declaratively). A transaction's category must belong to the same household and have a kind
-- matching the transaction type (category_kind and transaction_type share value names but are
-- distinct enums, so they are compared as text). When payment_source_id is set, the referenced
-- payment source must also belong to the same household. Both rows are locked FOR SHARE so a
-- concurrent update cannot re-home or re-kind them while the transaction write is in flight.
CREATE FUNCTION "transactions_enforce_category_and_payment_source"() RETURNS trigger AS $$
DECLARE
    category_row "categories"%ROWTYPE;
    payment_source_row "payment_sources"%ROWTYPE;
BEGIN
    SELECT * INTO category_row
      FROM "categories"
     WHERE "id" = NEW."category_id"
       FOR SHARE;

    IF FOUND THEN
        IF category_row."household_id" <> NEW."household_id" THEN
            RAISE EXCEPTION 'transaction category must belong to the same household'
                USING ERRCODE = 'check_violation',
                      CONSTRAINT = 'transactions_category_same_household_check';
        END IF;

        IF category_row."kind"::text <> NEW."type"::text THEN
            RAISE EXCEPTION 'transaction category kind must match the transaction type'
                USING ERRCODE = 'check_violation',
                      CONSTRAINT = 'transactions_category_kind_matches_type_check';
        END IF;
    END IF;
    -- When the category row does not exist, fall through and let the foreign key reject it.

    IF NEW."payment_source_id" IS NOT NULL THEN
        SELECT * INTO payment_source_row
          FROM "payment_sources"
         WHERE "id" = NEW."payment_source_id"
           FOR SHARE;

        IF FOUND AND payment_source_row."household_id" <> NEW."household_id" THEN
            RAISE EXCEPTION 'transaction payment source must belong to the same household'
                USING ERRCODE = 'check_violation',
                      CONSTRAINT = 'transactions_payment_source_same_household_check';
        END IF;
        -- When the payment source row does not exist, fall through and let the foreign key reject it.
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transactions_category_and_payment_source_trigger"
    BEFORE INSERT OR UPDATE OF "household_id", "type", "category_id", "payment_source_id" ON "transactions"
    FOR EACH ROW
    EXECUTE FUNCTION "transactions_enforce_category_and_payment_source"();
