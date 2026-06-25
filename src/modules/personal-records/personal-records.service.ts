import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PersonalRecordsService {
    constructor(private readonly prisma: PrismaService) {}

    findByUser(userId: string) {
        return this.prisma.personalRecord.findMany({
            where: { userId },
            include: { exercise: true, workout: true },
            orderBy: { value: "desc" }
        });
    }
}
