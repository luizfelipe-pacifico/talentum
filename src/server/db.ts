import { PrismaClient } from '@prisma/client';

const globalDatabase = globalThis as typeof globalThis & { talentumPrisma?: PrismaClient };

export const db = globalDatabase.talentumPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalDatabase.talentumPrisma = db;
