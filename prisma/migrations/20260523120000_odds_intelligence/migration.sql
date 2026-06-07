-- Odds intelligence: snapshots + CLV fields on predictions

CREATE TABLE "OddsSnapshot" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "odds" DOUBLE PRECISION NOT NULL,
    "impliedProb" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'provider',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OddsSnapshot_fixtureId_capturedAt_idx" ON "OddsSnapshot"("fixtureId", "capturedAt");
CREATE INDEX "OddsSnapshot_fixtureId_marketKey_capturedAt_idx" ON "OddsSnapshot"("fixtureId", "marketKey", "capturedAt");
CREATE INDEX "OddsSnapshot_capturedAt_idx" ON "OddsSnapshot"("capturedAt");

ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "fairOdds" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "closingOdds" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "clvPercent" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "bookmaker" TEXT;
