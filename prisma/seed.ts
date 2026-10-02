import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { signupSchema } from "../src/lib/validation";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const input = signupSchema.safeParse({
    name: "Event administrator",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  if (!input.success) {
    throw new Error("Set a valid ADMIN_EMAIL and a 12–72 character ADMIN_PASSWORD.");
  }

  const passwordHash = await bcrypt.hash(input.data.password, 12);
  const admin = await prisma.user.upsert({
    where: { email: input.data.email },
    create: {
      name: input.data.name,
      email: input.data.email,
      passwordHash,
      role: "ADMIN",
    },
    update: {
      name: input.data.name,
      passwordHash,
      role: "ADMIN",
    },
    select: { id: true },
  });

  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 14);
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);

  await prisma.event.upsert({
    where: { slug: "sample-learning-workshop" },
    create: {
      organizerId: admin.id,
      title: "Sample learning workshop",
      slug: "sample-learning-workshop",
      description: "A draft event for local setup and administrator previews.",
      location: "Online",
      startsAt,
      endsAt,
      capacity: 30,
      status: "DRAFT",
    },
    update: {},
  });
}

main()
  .catch(() => {
    console.error("Seed failed. Check the database and seed environment values.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
