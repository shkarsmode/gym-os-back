import { Body, Controller, Get, MessageEvent, Param, Post, Req, Res, Sse, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, interval, map, merge } from "rxjs";
import { ApprovedGuard } from "../../shared/approved.guard";
import { CurrentUser, RequestUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { LiveBus, LiveEvent } from "./live.bus";
import { LiveService } from "./live.service";
import { PartnerService } from "./partner.service";
import { CHEER_EMOJI } from "./live.rules";
import { CheerDto } from "./dto/cheer.dto";
import { StopWatchDto, WatchDto } from "./dto/watch.dto";
import { EditRightDto, InvitePartnerDto } from "./dto/partner.dto";

// A comment frame often enough to beat any idle timeout between here and the phone, and
// often enough that a connection dropped by a sleeping radio is noticed in seconds rather
// than whenever the user next taps something.
const HEARTBEAT_MS = 25_000;

/**
 * The live stream, as server-sent events rather than a WebSocket.
 *
 * That choice is about authorization, not about transport. This is an ordinary HTTP route,
 * so it keeps JwtAuthGuard, ApprovedGuard, the throttle and the hand-rolled CORS
 * middleware working exactly as they do everywhere else. A WebSocket upgrade carries none
 * of that: `context.switchToHttp()` returns nothing useful, so all four would have to be
 * reimplemented — and an upgrade request is exempt from CORS while still sending the
 * SameSite=None session cookie, which is how a page on another origin would have opened an
 * authenticated socket as the visitor.
 */
@Controller("live")
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class LiveController {
    constructor(
        private readonly bus: LiveBus,
        private readonly live: LiveService,
        private readonly partner: PartnerService
    ) {}

    @Get("partner")
    partnerState(@CurrentUser() user: RequestUser) {
        return this.partner.current(user);
    }

    @Post("partner/invite")
    invitePartner(@CurrentUser() user: RequestUser, @Body() dto: InvitePartnerDto) {
        return this.partner.invite(user, dto.userId);
    }

    @Post("partner/:id/accept")
    acceptPartner(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.partner.accept(user, id);
    }

    @Post("partner/:id/edit-right")
    setEditRight(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: EditRightDto) {
        return this.partner.setEditRight(user, id, dto.allow);
    }

    @Post("partner/:id/leave")
    leavePartner(@CurrentUser() user: RequestUser, @Param("id") id: string) {
        return this.partner.leave(user, id);
    }

    // Declared BEFORE any parameterised route: Nest matches in declaration order, and a
    // later "/:something" would otherwise swallow these.
    @Get("presence")
    presence() {
        return this.live.presence();
    }

    @Get("peers")
    peers(@CurrentUser() user: RequestUser) {
        return this.live.peers(user);
    }

    @Get("cheers/:workoutId")
    cheers(@CurrentUser() user: RequestUser, @Param("workoutId") workoutId: string) {
        return this.live.cheersFor(user, workoutId);
    }

    @Post("watch")
    watch(@CurrentUser() user: RequestUser, @Body() dto: WatchDto) {
        return this.live.watch(user, dto.token, dto.workoutId);
    }

    @Post("watch/stop")
    stopWatch(@CurrentUser() user: RequestUser, @Body() dto: StopWatchDto) {
        return this.live.stopWatch(dto.token);
    }

    @Post("cheer")
    cheer(@CurrentUser() user: RequestUser, @Body() dto: CheerDto) {
        return this.live.cheer(user, dto.workoutId, dto.emoji);
    }

    /** The emoji a client is allowed to offer, so the two sides cannot drift apart. */
    @Get("cheer-options")
    cheerOptions() {
        return { emoji: CHEER_EMOJI };
    }

    @Sse("stream")
    stream(
        @CurrentUser() user: RequestUser,
        @Req() request: Request,
        @Res() response: Response
    ): Observable<MessageEvent> {
        // Proxies that buffer would defeat the entire point — a hint held for 30 seconds
        // is worse than no hint, because the UI looks live and is not.
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Connection", "keep-alive");

        const stream = this.bus.open(user.id);
        const { events, close } = stream;
        // The response closing is the ONLY reliable signal a device went away: a phone
        // that loses signal never sends anything, it just stops being reachable. Without
        // this the map keeps a dead subject per lost connection forever.
        request.on("close", close);
        response.on("close", close);

        // The token identifies THIS connection, and the client echoes it back when it
        // registers a watch — so a person with two devices can watch two sessions, and
        // closing one does not tear down the other.
        const hello: LiveEvent = { name: "hello", at: new Date().toISOString(), token: stream.token };
        const beats = interval(HEARTBEAT_MS).pipe(
            map((): LiveEvent => ({ name: "ping", at: new Date().toISOString() }))
        );

        return merge(
            // Sent immediately so the client can tell "connected" from "still connecting"
            // without waiting for the first real event, which may be hours away.
            new Observable<LiveEvent>((subscriber) => {
                subscriber.next(hello);
            }),
            events,
            beats
        ).pipe(map((event): MessageEvent => ({ type: event.name, data: event })));
    }
}
