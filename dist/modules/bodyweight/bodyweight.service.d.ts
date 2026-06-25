import { PrismaService } from "../../prisma/prisma.service";
import { CreateBodyweightDto } from "./dto/create-bodyweight.dto";
export declare class BodyweightService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findMine(userId: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        userId: string;
        createdAt: Date;
        bodyweight: import("@prisma/client/runtime/library").Decimal;
        date: Date;
        notes: string | null;
    }[]>;
    createMine(userId: string, dto: CreateBodyweightDto): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        bodyweight: import("@prisma/client/runtime/library").Decimal;
        date: Date;
        notes: string | null;
    }>;
    deleteMine(userId: string, entryId: string): Promise<{
        ok: boolean;
    }>;
}
