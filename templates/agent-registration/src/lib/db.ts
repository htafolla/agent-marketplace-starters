import { PrismaClient } from "@prisma/client";

/**
 * Database Client
 * 
 * Singleton Prisma client for Next.js.
 * In development, hot reloading can create multiple instances.
 * This pattern prevents that.
 */

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
