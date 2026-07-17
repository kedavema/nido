-- CreateEnum
CREATE TYPE "household_role" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "household_member_status" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower(btrim("email")))
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'PYG',
    "timezone" TEXT NOT NULL DEFAULT 'America/Asuncion',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "households_name_not_blank_check" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "households_base_currency_check" CHECK ("base_currency" = 'PYG')
);

-- CreateTable
CREATE TABLE "household_members" (
    "household_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "household_role" NOT NULL,
    "status" "household_member_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("household_id", "user_id")
);

-- CreateTable
CREATE TABLE "household_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "household_invites_email_normalized_check" CHECK ("email_normalized" = lower(btrim("email_normalized"))),
    CONSTRAINT "household_invites_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "household_invites_expiry_check" CHECK ("expires_at" > "created_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "households_created_by_idx" ON "households"("created_by");

-- CreateIndex
CREATE INDEX "household_members_household_id_status_idx" ON "household_members"("household_id", "status");

-- CreateIndex
CREATE INDEX "household_members_user_id_status_idx" ON "household_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_token_hash_key" ON "household_invites"("token_hash");

-- CreateIndex
CREATE INDEX "household_invites_household_id_email_normalized_idx" ON "household_invites"("household_id", "email_normalized");

-- CreateIndex
CREATE INDEX "household_invites_household_id_expires_at_idx" ON "household_invites"("household_id", "expires_at");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_created_by_fkey" FOREIGN KEY ("household_id", "created_by") REFERENCES "household_members"("household_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
