import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { RankingsService } from "./rankings.service";

@Controller("rankings")
@UseGuards(JwtAuthGuard)
export class RankingsController {
    constructor(private readonly rankingsService: RankingsService) {}

    @Get()
    findAll() {
        return this.rankingsService.findAll();
    }
}
