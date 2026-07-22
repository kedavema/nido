-- CreateEnum
CREATE TYPE "recurring_item_kind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "recurring_frequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'YEARLY', 'EVERY_N_MONTHS');

-- CreateEnum
CREATE TYPE "occurrence_status" AS ENUM ('PENDING', 'SETTLED', 'OVERDUE', 'SKIPPED');

-- CreateTable
CREATE TABLE "recurring_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "kind" "recurring_item_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "payment_source_id" UUID,
    "responsible_user_id" UUID,
    "estimated_amount" DECIMAL(18,2) NOT NULL,
    "currency" "transaction_currency" NOT NULL,
    "planned_fx_rate_to_base" DECIMAL(18,4),
    "frequency" "recurring_frequency" NOT NULL,
    "interval_months" INTEGER,
    "first_due_date" DATE NOT NULL,
    "end_date" DATE,
    "notification_offsets" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recurring_item_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "transaction_currency" NOT NULL,
    "fx_rate_to_base" DECIMAL(18,4),
    "responsible_user_id" UUID,
    "status" "occurrence_status" NOT NULL DEFAULT 'PENDING',
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_items_household_id_is_active_idx" ON "recurring_items"("household_id", "is_active");

-- CreateIndex
CREATE INDEX "recurring_items_category_id_idx" ON "recurring_items"("category_id");

-- CreateIndex
CREATE INDEX "recurring_items_payment_source_id_idx" ON "recurring_items"("payment_source_id");

-- CreateIndex
CREATE INDEX "recurring_items_responsible_user_id_idx" ON "recurring_items"("responsible_user_id");

-- CreateIndex
CREATE INDEX "occurrences_household_id_due_date_idx" ON "occurrences"("household_id", "due_date");

-- CreateIndex
CREATE INDEX "occurrences_household_id_status_idx" ON "occurrences"("household_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "occurrences_recurring_item_id_due_date_key" ON "occurrences"("recurring_item_id", "due_date");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_occurrence_id_fkey" FOREIGN KEY ("source_occurrence_id") REFERENCES "occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_payment_source_id_fkey" FOREIGN KEY ("payment_source_id") REFERENCES "payment_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_recurring_item_id_fkey" FOREIGN KEY ("recurring_item_id") REFERENCES "recurring_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
