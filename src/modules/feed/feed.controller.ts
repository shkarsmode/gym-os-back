import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { ApprovedGuard } from "../../shared/approved.guard";
import { AdminGuard } from "../../shared/admin.guard";
import { FeedService } from "./feed.service";
import { PushService } from "./push.service";
import {
    AchievementSyncDto,
    CommentDto,
    EditCommentDto,
    FeedQueryDto,
    MarkReadDto,
    PushSubscribeDto,
    PushUnsubscribeDto,
    ReportDto,
    ResolveReportDto
} from "./dto/feed.dto";

// Every route requires an approved account: the feed is the team's shared space, so
// a pending sign-up must not be able to read or post in it.
@Controller("feed")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class FeedController {
    constructor(
        private readonly feed: FeedService,
        private readonly push: PushService
    ) {}

    @Get()
    list(@CurrentUser() user: RequestUser, @Query() query: FeedQueryDto) {
        return this.feed.feed(user, query.scope || "team", query.cursor, query.limit);
    }

    // Literal routes must precede the parameterised ones below — Nest matches in
    // declaration order.
    @Get("notifications")
    notifications(@CurrentUser() user: RequestUser, @Query("cursor") cursor?: string) {
        return this.feed.notifications(user, cursor);
    }

    @Get("notifications/unread")
    unread(@CurrentUser() user: RequestUser) {
        return this.feed.unreadCount(user);
    }

    @Post("notifications/read")
    markRead(@CurrentUser() user: RequestUser, @Body() dto: MarkReadDto) {
        return this.feed.markRead(user, dto.ids);
    }

    @Get("reports")
    @UseGuards(AdminGuard)
    reports() {
        return this.feed.openReports();
    }

    @Get("reports/count")
    @UseGuards(AdminGuard)
    reportCount() {
        return this.feed.openReportCount();
    }

    @Post("reports/:id/resolve")
    @UseGuards(AdminGuard)
    resolveReport(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: ResolveReportDto) {
        return this.feed.resolveReport(user, id, dto.action);
    }

    @Post("report")
    report(@CurrentUser() user: RequestUser, @Body() dto: ReportDto) {
        return this.feed.report(user, dto.targetType, dto.targetId, dto.reason, dto.details);
    }

    @Post("achievements/sync")
    syncAchievements(@CurrentUser() user: RequestUser, @Body() dto: AchievementSyncDto) {
        return this.feed.syncAchievements(user, dto.items || []);
    }

    // ---- Push ------------------------------------------------------------
    @Get("push/key")
    pushKey() {
        return { configured: this.push.isConfigured(), publicKey: this.push.publicKey() };
    }

    @Post("push/subscribe")
    subscribe(@CurrentUser() user: RequestUser, @Body() dto: PushSubscribeDto) {
        return this.push.subscribe(user.id, dto.endpoint, dto.p256dh, dto.auth);
    }

    @Post("push/unsubscribe")
    unsubscribe(@CurrentUser() user: RequestUser, @Body() dto: PushUnsubscribeDto) {
        return this.push.unsubscribe(user.id, dto.endpoint);
    }

    // ---- Comments (id-scoped, declared before the generic :type/:id routes) --
    @Post("comments/:id/update")
    editComment(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: EditCommentDto) {
        return this.feed.editComment(user, id, dto.body);
    }

    @Post("comments/:id/delete")
    deleteComment(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.feed.deleteComment(user, id);
    }

    // ---- Per-item routes -------------------------------------------------
    @Get(":type/:id")
    item(@CurrentUser() user: RequestUser, @Param("type") type: string, @Param("id") id: string) {
        return this.feed.item(user, type, id);
    }

    @Get(":type/:id/comments")
    comments(@CurrentUser() user: RequestUser, @Param("type") type: string, @Param("id") id: string) {
        return this.feed.comments(user, type, id);
    }

    @Post(":type/:id/comments")
    addComment(
        @CurrentUser() user: RequestUser,
        @Param("type") type: string,
        @Param("id") id: string,
        @Body() dto: CommentDto
    ) {
        return this.feed.addComment(user, type, id, dto.body, dto.parentId);
    }

    @Post(":type/:id/react")
    react(@CurrentUser() user: RequestUser, @Param("type") type: string, @Param("id") id: string) {
        return this.feed.toggleReaction(user, type, id);
    }
}
