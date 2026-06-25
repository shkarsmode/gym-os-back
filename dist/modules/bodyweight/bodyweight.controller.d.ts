import { RequestUser } from "../../shared/current-user.decorator";
import { CreateBodyweightDto } from "./dto/create-bodyweight.dto";
import { BodyweightService } from "./bodyweight.service";
export declare class BodyweightController {
    private readonly bodyweightService;
    constructor(bodyweightService: BodyweightService);
    findMine(user: RequestUser): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        userId: string;
        createdAt: Date;
        bodyweight: import("@prisma/client/runtime/library").Decimal;
        date: Date;
        notes: string | null;
    }[]>;
    createMine(user: RequestUser, dto: CreateBodyweightDto): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        bodyweight: import("@prisma/client/runtime/library").Decimal;
        date: Date;
        notes: string | null;
    }>;
    deleteMine(user: RequestUser, entryId: string): Promise<{
        ok: boolean;
    }>;
}
