-- CreateTable
CREATE TABLE "budget_months" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "total_limit_pyg" DECIMAL(18,0) NOT NULL,
    "copied_from_id" UUID,

    CONSTRAINT "budget_months_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_months_month_first_day_check" CHECK (EXTRACT(DAY FROM "month") = 1),
    CONSTRAINT "budget_months_total_limit_non_negative_check" CHECK ("total_limit_pyg" >= 0)
);

-- CreateTable
CREATE TABLE "budget_allocations" (
    "budget_month_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount_pyg" DECIMAL(18,0) NOT NULL,

    CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("budget_month_id", "category_id"),
    CONSTRAINT "budget_allocations_amount_non_negative_check" CHECK ("amount_pyg" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_months_household_id_month_key"
    ON "budget_months"("household_id", "month");

CREATE INDEX "budget_months_copied_from_id_idx"
    ON "budget_months"("copied_from_id");

CREATE INDEX "budget_allocations_category_id_idx"
    ON "budget_allocations"("category_id");

-- AddForeignKey
ALTER TABLE "budget_months"
    ADD CONSTRAINT "budget_months_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "budget_months"
    ADD CONSTRAINT "budget_months_copied_from_id_fkey"
    FOREIGN KEY ("copied_from_id") REFERENCES "budget_months"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "budget_allocations"
    ADD CONSTRAINT "budget_allocations_budget_month_id_fkey"
    FOREIGN KEY ("budget_month_id") REFERENCES "budget_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "budget_allocations"
    ADD CONSTRAINT "budget_allocations_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Budget allocation category checks are hand-written because Prisma cannot express the
-- cross-table invariants: the category must belong to the same household, be EXPENSE-kind, and
-- be a root category. The sum <= total_limit rule remains an application transaction invariant.
CREATE FUNCTION "budget_allocations_enforce_category"() RETURNS trigger AS $$
DECLARE
    budget_month_row "budget_months"%ROWTYPE;
    category_row "categories"%ROWTYPE;
BEGIN
    SELECT * INTO budget_month_row
      FROM "budget_months"
     WHERE "id" = NEW."budget_month_id"
       FOR SHARE;

    IF FOUND THEN
        SELECT * INTO category_row
          FROM "categories"
         WHERE "id" = NEW."category_id"
           FOR SHARE;

        IF FOUND THEN
            IF category_row."household_id" <> budget_month_row."household_id" THEN
                RAISE EXCEPTION 'budget allocation category must belong to the same household'
                    USING ERRCODE = 'check_violation',
                          CONSTRAINT = 'budget_allocations_category_same_household_check';
            END IF;

            IF category_row."kind" <> 'EXPENSE'::"category_kind" THEN
                RAISE EXCEPTION 'budget allocation category must be an expense category'
                    USING ERRCODE = 'check_violation',
                          CONSTRAINT = 'budget_allocations_category_kind_check';
            END IF;

            IF category_row."parent_id" IS NOT NULL THEN
                RAISE EXCEPTION 'budget allocation category must be a root category'
                    USING ERRCODE = 'check_violation',
                          CONSTRAINT = 'budget_allocations_category_root_check';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "budget_allocations_category_trigger"
    BEFORE INSERT OR UPDATE OF "budget_month_id", "category_id"
    ON "budget_allocations"
    FOR EACH ROW
    EXECUTE FUNCTION "budget_allocations_enforce_category"();
