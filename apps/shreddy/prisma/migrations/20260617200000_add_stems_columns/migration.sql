-- R5 stems pipeline. Three additive columns on Song:
--   stemsState        — pending | processing | ready | error
--   stemsErrorMessage — populated when stemsState = error
--   stemsCompletedAt  — wall-clock at last successful render
-- All nullable / defaulted so existing rows backfill cleanly.

ALTER TABLE "Song" ADD COLUMN "stemsState" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Song" ADD COLUMN "stemsErrorMessage" TEXT;
ALTER TABLE "Song" ADD COLUMN "stemsCompletedAt" DATETIME;
