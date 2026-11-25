import prismaClient from "@prisma/client";

const prisma = new prismaClient.PrismaClient();

try {
    const revoked = await prisma.$executeRawUnsafe('UPDATE "McpToken" SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL');
    console.log(`Revoked ${revoked} MCP token(s).`);
} catch (error) {
    console.error(`Could not revoke MCP tokens: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
