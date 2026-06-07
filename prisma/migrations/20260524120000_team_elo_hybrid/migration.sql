-- CreateTable
CREATE TABLE "TeamEloRating" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" TEXT NOT NULL DEFAULT 'current',
    "elo" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamEloRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamEloRating_teamId_idx" ON "TeamEloRating"("teamId");

-- CreateIndex
CREATE INDEX "TeamEloRating_leagueId_idx" ON "TeamEloRating"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEloRating_teamId_leagueId_season_key" ON "TeamEloRating"("teamId", "leagueId", "season");
