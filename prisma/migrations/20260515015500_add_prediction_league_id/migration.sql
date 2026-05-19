-- Align the database with prisma/schema.prisma. The application writes
-- Prediction.leagueId from /api/predictions, so existing databases need the
-- nullable column and index.

ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "leagueId" TEXT;
CREATE INDEX IF NOT EXISTS "Prediction_leagueId_idx" ON "Prediction"("leagueId");
