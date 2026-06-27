import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { SetApprovalDto } from "./dto/set-approval.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    findAll() {
        return this.usersService.findAll();
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.usersService.findOne(id);
    }

    @Post("me/profile")
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    updateMyProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
        return this.usersService.updateProfile(user.id, dto);
    }

    // Admin-only: approve/revoke a user's access (enforced in the service).
    @Post(":id/approval")
    @UseGuards(JwtAuthGuard)
    setApproval(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: SetApprovalDto) {
        return this.usersService.setApproval(user, id, dto.approved);
    }
}
