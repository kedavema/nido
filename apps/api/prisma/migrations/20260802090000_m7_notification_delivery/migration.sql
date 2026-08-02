-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('ANDROID', 'WEB');

CREATE TYPE "notification_channel" AS ENUM ('EXPO', 'WEB_PUSH');

CREATE TYPE "notification_delivery_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TYPE "notification_error_kind" AS ENUM ('TRANSIENT', 'PERMANENT', 'INVALID_CREDENTIAL');

-- CreateTable
CREATE TABLE "device_installations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "installation_id" TEXT NOT NULL,
    "platform" "device_platform" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "credential_ciphertext" TEXT,
    "credential_fingerprint" CHAR(64),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "deactivated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_installations_pkey" PRIMARY KEY ("id"),
    -- An active install must be usable: deactivating is what clears the credential, so a row with
    -- no ciphertext and no deactivation timestamp is a state the dispatcher cannot act on.
    CONSTRAINT "device_installations_active_has_credential_check"
        CHECK (("deactivated_at" IS NULL) = ("credential_ciphertext" IS NOT NULL)),
    CONSTRAINT "device_installations_active_has_fingerprint_check"
        CHECK (("deactivated_at" IS NULL) = ("credential_fingerprint" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "scheduled_for" DATE NOT NULL,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_kind" "notification_error_kind",
    "claimed_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    -- The three-attempt ceiling of ADR 0012 expressed in the schema, so a bug in the claim query
    -- fails loudly instead of retrying a dead delivery forever.
    CONSTRAINT "notification_deliveries_attempts_range_check"
        CHECK ("attempts" >= 0 AND "attempts" <= 3),
    -- Offsets come from recurring_items.notification_offsets: days before the due date, so never
    -- negative. The upper bound matches the 12-month generation horizon of ADR 0009.
    CONSTRAINT "notification_deliveries_offset_days_range_check"
        CHECK ("offset_days" >= 0 AND "offset_days" <= 365),
    -- SENT is the only state that carries a send timestamp, and only a claimed row can be SENDING.
    CONSTRAINT "notification_deliveries_sent_at_status_check"
        CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL)),
    CONSTRAINT "notification_deliveries_sending_is_claimed_check"
        CHECK ("status" <> 'SENDING' OR "claimed_at" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "internal_job_nonces" (
    "nonce" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_job_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_installations_installation_id_key"
    ON "device_installations"("installation_id");

-- A reinstall can hand the same provider token to a fresh installation id. Without this, that
-- produces two active rows and duplicate push. Partial so that deactivated rows — whose
-- fingerprint is NULL anyway — never block a later re-registration of the same device.
CREATE UNIQUE INDEX "device_installations_credential_fingerprint_active_key"
    ON "device_installations"("credential_fingerprint")
    WHERE "deactivated_at" IS NULL;

CREATE INDEX "device_installations_user_id_deactivated_at_idx"
    ON "device_installations"("user_id", "deactivated_at");

-- The idempotency key of the enqueue step (ADR 0012): the daily sweep inserts with
-- ON CONFLICT DO NOTHING, so a repeated or concurrent run never queues the same reminder twice.
CREATE UNIQUE INDEX "notification_deliveries_occurrence_id_offset_days_key"
    ON "notification_deliveries"("occurrence_id", "offset_days");

CREATE INDEX "notification_deliveries_status_scheduled_for_idx"
    ON "notification_deliveries"("status", "scheduled_for");

CREATE INDEX "notification_deliveries_household_id_scheduled_for_idx"
    ON "notification_deliveries"("household_id", "scheduled_for");

CREATE INDEX "internal_job_nonces_created_at_idx"
    ON "internal_job_nonces"("created_at");

-- AddForeignKey
ALTER TABLE "device_installations"
    ADD CONSTRAINT "device_installations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_occurrence_id_fkey"
    FOREIGN KEY ("occurrence_id") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
