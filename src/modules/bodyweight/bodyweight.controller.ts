import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { CreateBodyweightDto } from "./dto/create-bodyweight.dto";
import { BodyweightService } from "./bodyweight.service";

@Controller("users/me/bodyweight")
@UseGuards(JwtAuthGuard)
export class BodyweightController {
    constructor(private readonly bodyweightService: BodyweightService) {}

    @Get()
    findMine(@CurrentUser() user: RequestUser) {
        return this.bodyweightService.findMine(user.id);
    }

    @Post()
    createMine(@CurrentUser() user: RequestUser, @Body() dto: CreateBodyweightDto) {
        return this.bodyweightService.createMine(user.id, dto);
    }

    @Post(":entryId/delete")
    deleteMine(@CurrentUser() user: RequestUser, @Param("entryId") entryId: string) {
        return this.bodyweightService.deleteMine(user.id, entryId);
    }
}
