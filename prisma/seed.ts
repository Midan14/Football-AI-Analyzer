import { PrismaClient, UserRole, UserStatus, ModelMode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create demo users
  const adminPassword = await bcrypt.hash("admin123456", 12);
  const userPassword = await bcrypt.hash("user123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@football-ai.com" },
    update: {},
    create: {
      email: "admin@football-ai.com",
      password: adminPassword,
      name: "Admin User",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      timezone: "America/Bogota",
      language: "es",
      modelMode: ModelMode.BALANCED,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "user@football-ai.com" },
    update: {},
    create: {
      email: "user@football-ai.com",
      password: userPassword,
      name: "Demo User",
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      timezone: "America/Bogota",
      language: "es",
      modelMode: ModelMode.BALANCED,
    },
  });

  console.log("✅ Created users:");
  console.log(`   Admin: admin@football-ai.com / admin123456`);
  console.log(`   User: user@football-ai.com / user123456`);

  // Create sample watchlist item
  const watchlist = await prisma.watchlistItem.upsert({
    where: {
      userId_fixtureId: {
        userId: user.id,
        fixtureId: "sample-fixture-1",
      },
    },
    update: {},
    create: {
      userId: user.id,
      fixtureId: "sample-fixture-1",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      notes: "Classic match",
    },
  });

  console.log("✅ Created watchlist items");

  // Create sample analysis
  const analysis = await prisma.analysis.create({
    data: {
      userId: user.id,
      fixtureId: "sample-fixture-1",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      league: "La Liga",
      country: "Spain",
      matchDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      homeWinProb: 45.2,
      drawProb: 28.3,
      awayWinProb: 26.5,
      over15Prob: 72.1,
      over25Prob: 45.8,
      under35Prob: 54.2,
      bttsProb: 62.3,
      confidenceScore: 75,
      riskFlags: [
        {
          id: "travel_distance",
          label: "Distancia de viaje significativa",
          severity: "low",
        },
      ],
      penalties: [
        { id: "no_lineups", label: "Alineaciones no confirmadas", points: 10 },
      ],
      valueMarkets: [
        {
          market: "Over 2.5",
          modelProbability: 45.8,
          marketProbability: 42.1,
          edge: 3.7,
          verdict: "Valor",
        },
      ],
      bestBet: "Over 2.5 Goals",
      stakeUnits: 1.0,
      modelMode: ModelMode.BALANCED,
      dataProvider: "demo",
    },
  });

  console.log("✅ Created sample analysis");

  console.log("\n✨ Database seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
