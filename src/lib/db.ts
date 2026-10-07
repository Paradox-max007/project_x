import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logs are noisy (and cost log volume) on serverless — keep them
    // for local development only.
    log:
      process.env.NODE_ENV === "development"
        ? ["query"]
        : ["error", "warn"],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db