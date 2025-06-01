import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting production seed...');

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const firstName = 'Admin';
    const lastName = 'User';

  if (!adminEmail || !adminPassword) {
    console.error(
      'Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set for production seeding.',
    );
    process.exit(1);
  }

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        firstName: firstName,
        lastName: lastName,
        role: UserRole.ADMIN, 
      },
    });
    console.log(`Admin user with email "${adminEmail}" created successfully.`);
  } else {
    console.log(`Admin user with email "${adminEmail}" already exists. Skipping creation.`);
  }

  // Add any other minimal essential data for MVP functionality here
  // For example, default categories, system settings, etc.
  // console.log('Seeding default categories...');
  // await prisma.category.upsert({ ... });

  console.log('Production seed finished.');
}

main()
  .catch((e) => {
    console.error('Error during production seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
