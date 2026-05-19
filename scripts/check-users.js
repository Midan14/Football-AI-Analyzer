const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('Usuarios encontrados:', users.length);
  console.log(JSON.stringify(users, null, 2));
}

checkUsers().catch(console.error).finally(() => prisma.$disconnect());
