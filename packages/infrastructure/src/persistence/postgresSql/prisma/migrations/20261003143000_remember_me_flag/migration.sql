-- AlterTable: persist the explicit 30-day opt-in on refresh sessions.
-- DEFAULT true preserves the lifetime pre-existing rows were issued with.
ALTER TABLE "refresh_tokens" ADD COLUMN "remember_me" BOOLEAN NOT NULL DEFAULT true;
