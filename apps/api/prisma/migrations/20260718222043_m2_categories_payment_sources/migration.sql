-- CreateEnum
CREATE TYPE "payment_source_type" AS ENUM ('BANK_ACCOUNT', 'CASH', 'CREDIT_CARD', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "category_kind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateTable
CREATE TABLE "payment_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "payment_source_type" NOT NULL,
    "owner_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_sources_name_not_blank_check" CHECK (length(btrim("name")) > 0)
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "kind" "category_kind" NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "categories_name_not_blank_check" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "categories_sort_order_non_negative_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "categories_no_self_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

-- CreateIndex
CREATE INDEX "payment_sources_household_id_is_active_idx" ON "payment_sources"("household_id", "is_active");

-- CreateIndex
CREATE INDEX "payment_sources_owner_user_id_idx" ON "payment_sources"("owner_user_id");

-- CreateIndex
CREATE INDEX "categories_household_id_kind_is_active_idx" ON "categories"("household_id", "kind", "is_active");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- AddForeignKey
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sources" ADD CONSTRAINT "payment_sources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Active-sibling name uniqueness (hand-written; Prisma cannot express partial unique indexes).
-- NULLS NOT DISTINCT (PostgreSQL >= 15; this project runs 18.x in compose and CI) makes the
-- NULL-parent root level participate: two active roots of the same household and kind cannot
-- share a name, and neither can two active children of the same parent. Archived rows
-- (is_active = false) are excluded, so an archived sibling's name can be reused.
CREATE UNIQUE INDEX "categories_active_sibling_name_key"
    ON "categories" ("household_id", "kind", "parent_id", "name") NULLS NOT DISTINCT
    WHERE "is_active";

-- Two-level hierarchy enforcement (hand-written; Prisma cannot express it declaratively).
-- A category whose parent_id is set must reference a root category (parent_id IS NULL) of the
-- same household and kind, and a category that already has children can never gain a parent.
-- The parent row is locked FOR SHARE so a concurrent transaction cannot re-parent it while a
-- child insert is in flight.
CREATE FUNCTION "categories_enforce_two_levels"() RETURNS trigger AS $$
DECLARE
    parent_row "categories"%ROWTYPE;
BEGIN
    IF NEW."parent_id" IS NOT NULL THEN
        SELECT * INTO parent_row
          FROM "categories"
         WHERE "id" = NEW."parent_id"
           FOR SHARE;

        IF FOUND THEN
            IF parent_row."household_id" <> NEW."household_id" THEN
                RAISE EXCEPTION 'category parent must belong to the same household'
                    USING ERRCODE = 'check_violation',
                          CONSTRAINT = 'categories_parent_same_household_check';
            END IF;

            IF parent_row."kind" <> NEW."kind" THEN
                RAISE EXCEPTION 'category parent must be of the same kind'
                    USING ERRCODE = 'check_violation',
                          CONSTRAINT = 'categories_parent_same_kind_check';
            END IF;

            IF parent_row."parent_id" IS NOT NULL THEN
                RAISE EXCEPTION 'categories support at most two levels: the parent is already a subcategory'
                    USING ERRCODE = 'check_violation',
                          CONSTRAINT = 'categories_two_levels_check';
            END IF;
        END IF;
        -- When the parent row does not exist, fall through and let the foreign key reject it.

        IF EXISTS (SELECT 1 FROM "categories" WHERE "parent_id" = NEW."id") THEN
            RAISE EXCEPTION 'categories support at most two levels: a category with children cannot become a child'
                USING ERRCODE = 'check_violation',
                      CONSTRAINT = 'categories_two_levels_check';
        END IF;
    END IF;

    -- A root category that still has children cannot change household or kind: the children
    -- would silently stop sharing household and kind with their parent (cross-tenant drift).
    IF TG_OP = 'UPDATE'
       AND (NEW."household_id" IS DISTINCT FROM OLD."household_id"
            OR NEW."kind" IS DISTINCT FROM OLD."kind")
       AND EXISTS (SELECT 1 FROM "categories" WHERE "parent_id" = NEW."id") THEN
        RAISE EXCEPTION 'category household and kind cannot change while it has children'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'categories_children_consistency_check';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "categories_two_levels_trigger"
    BEFORE INSERT OR UPDATE OF "parent_id", "household_id", "kind" ON "categories"
    FOR EACH ROW
    EXECUTE FUNCTION "categories_enforce_two_levels"();
