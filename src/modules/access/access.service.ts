import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { LiveBus } from "../live/live.bus";
import { PushService } from "../feed/push.service";
import {
    BLOCK_UNTIL,
    canRequest,
    cooldownUntil,
    isBlocked,
    viewerFacingStatus
} from "./access.rules";

/**
 * Asking a member to see their training, and the answer.
 *
 * Every transition below is scoped by the ROLE that may make it — an owner id for the
 * decisions an owner makes, a viewer id for the ones the requester makes — and each is a
 * conditional update rather than a read followed by a write. Both matter: keying a
 * transition on the grant id alone would let the person who asked accept their own
 * request, and a read-then-write leaves a reject racing a re-request with a pending row
 * carrying a live cooldown.
 *
 * Rows are never deleted. Cancelling or unsubscribing sets a status; the row also holds
 * the cooldown and the refusal count, so removing it would let one extra tap reset both.
 */
@Injectable()
export class AccessService {
    private readonly logger = new Logger(AccessService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly live: LiveBus,
        private readonly push: PushService
    ) {}

    /** Everything this person needs to render the privacy UI in one round trip. */
    async state(user: RequestUser) {
        const [me, incoming, outgoing, subscribers] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: user.id },
                select: { hideWorkoutDetails: true, privacyChoiceAt: true }
            }),
            // Requests waiting on ME.
            this.prisma.workoutAccessGrant.findMany({
                where: { ownerId: user.id, status: "pending" },
                orderBy: { createdAt: "desc" },
                include: { viewer: { select: { id: true, displayName: true, avatarUrl: true } } }
            }),
            // Requests I have made.
            this.prisma.workoutAccessGrant.findMany({
                where: { viewerId: user.id, status: { in: ["pending", "accepted", "rejected"] } },
                include: { owner: { select: { id: true, displayName: true, avatarUrl: true } } }
            }),
            // Who can currently see MY training.
            this.prisma.workoutAccessGrant.findMany({
                where: { ownerId: user.id, status: "accepted" },
                orderBy: { decidedAt: "desc" },
                include: { viewer: { select: { id: true, displayName: true, avatarUrl: true } } }
            })
        ]);
        return {
            hideWorkoutDetails: Boolean(me?.hideWorkoutDetails),
            // Null means this person has never been asked — the one-time prompt is still
            // owed to them. Any timestamp means they have answered, including by keeping
            // the default.
            privacyChoiceAt: me?.privacyChoiceAt?.toISOString() || null,
            incoming: incoming.map((row) => ({
                id: row.id,
                createdAt: row.createdAt.toISOString(),
                viewer: row.viewer
            })),
            // A refusal is reported to the requester as "still waiting" — see
            // viewerFacingStatus for why.
            outgoing: outgoing.map((row) => ({
                ownerId: row.ownerId,
                owner: row.owner,
                status: viewerFacingStatus(row)
            })),
            subscribers: subscribers.map((row) => ({
                id: row.id,
                since: row.decidedAt?.toISOString() || row.updatedAt.toISOString(),
                viewer: row.viewer
            }))
        };
    }

    async setPrivacy(user: RequestUser, hide: boolean) {
        await this.prisma.user.update({
            where: { id: user.id },
            data: { hideWorkoutDetails: hide, privacyChoiceAt: new Date() }
        });
        // Tell this person's other devices, so a phone showing the old switch corrects
        // itself rather than being able to turn it back off from stale state.
        this.publish(user.id, "access.changed");
        return { ok: true, hideWorkoutDetails: hide };
    }

    /**
     * Record that the person has been ASKED about privacy, whatever they chose.
     *
     * Without this a member who keeps the public default has a null `privacyChoiceAt`
     * forever and the one-time prompt reappears on every single app open.
     */
    async acknowledgePrivacy(user: RequestUser) {
        await this.prisma.user.update({
            where: { id: user.id },
            data: { privacyChoiceAt: new Date() }
        });
        return { ok: true };
    }

    async request(user: RequestUser, ownerId: string) {
        if (ownerId === user.id) {
            throw new BadRequestException("You already see your own training");
        }
        const owner = await this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { id: true, displayName: true, hideWorkoutDetails: true }
        });
        if (!owner) {
            throw new NotFoundException("Member not found");
        }
        const existing = await this.prisma.workoutAccessGrant.findUnique({
            where: { ownerId_viewerId: { ownerId, viewerId: user.id } }
        });
        const verdict = canRequest(existing, new Date());
        if (!verdict.allowed) {
            if (verdict.reason === "already_accepted") {
                return { ok: true, status: "accepted" as const };
            }
            if (verdict.reason === "already_pending") {
                return { ok: true, status: "pending" as const };
            }
            // Deliberately says nothing about how long, how many times, or whether this
            // is a block — see canRequest.
            throw new ForbiddenException({
                code: "ACCESS_COOLDOWN",
                message: "Запит уже надіслано. Спробуй пізніше."
            });
        }

        await this.prisma.workoutAccessGrant.upsert({
            where: { ownerId_viewerId: { ownerId, viewerId: user.id } },
            // Re-requesting after a cooldown reuses the row: rejectedCount and the
            // escalation it drives must survive.
            update: { status: "pending", cooldownUntil: null, decidedAt: null },
            create: { ownerId, viewerId: user.id, status: "pending" }
        });

        await this.notifyOwner(owner.id, user);
        this.publish(owner.id, "access.changed");
        return { ok: true, status: "pending" as const };
    }

    async accept(user: RequestUser, grantId: string) {
        // Scoped to the OWNER and to a pending row in one statement. Keyed on the id
        // alone, the person who asked could accept their own request.
        const { count } = await this.prisma.workoutAccessGrant.updateMany({
            where: { id: grantId, ownerId: user.id, status: "pending" },
            data: { status: "accepted", decidedAt: new Date(), cooldownUntil: null }
        });
        if (!count) {
            throw new NotFoundException("Request not found");
        }
        const grant = await this.prisma.workoutAccessGrant.findUnique({ where: { id: grantId } });
        if (grant) {
            await this.notifyViewerGranted(grant.viewerId, user);
            // The viewer is holding a payload built when they could not see this data.
            // Telling them to re-read is what makes the grant take effect without a
            // reload — an accepted request that only works tomorrow is not a feature.
            this.publish(grant.viewerId, "access.changed");
        }
        this.publish(user.id, "access.changed");
        return { ok: true };
    }

    async reject(user: RequestUser, grantId: string, block = false) {
        const grant = await this.prisma.workoutAccessGrant.findFirst({
            where: { id: grantId, ownerId: user.id, status: { in: ["pending", "accepted"] } }
        });
        if (!grant) {
            throw new NotFoundException("Request not found");
        }
        // The count AFTER this refusal — passing the value read before the write shifts
        // the whole escalation ladder by one.
        const rejectedCount = grant.rejectedCount + 1;
        const { count } = await this.prisma.workoutAccessGrant.updateMany({
            where: { id: grantId, ownerId: user.id, status: grant.status },
            data: {
                status: "rejected",
                rejectedCount,
                decidedAt: new Date(),
                cooldownUntil: block ? BLOCK_UNTIL : cooldownUntil(rejectedCount, new Date())
            }
        });
        if (!count) {
            // Lost a race with another decision on the same row.
            throw new NotFoundException("Request not found");
        }
        // The viewer is NOT notified. Being told "X declined you" in a gym of thirteen
        // people turns a quiet setting into a social event, which is what the owner chose
        // privacy to avoid. Their client simply keeps showing the request as pending.
        this.publish(grant.viewerId, "access.changed");
        this.publish(user.id, "access.changed");
        return { ok: true };
    }

    /** Owner withdrawing access they had granted. */
    async revoke(user: RequestUser, grantId: string) {
        const grant = await this.prisma.workoutAccessGrant.findFirst({
            where: { id: grantId, ownerId: user.id, status: "accepted" }
        });
        if (!grant) {
            throw new NotFoundException("Subscription not found");
        }
        await this.prisma.workoutAccessGrant.updateMany({
            where: { id: grantId, ownerId: user.id, status: "accepted" },
            data: { status: "rejected", decidedAt: new Date(), cooldownUntil: cooldownUntil(1, new Date()) }
        });
        // The ex-subscriber is holding detail in memory and in IndexedDB that they are no
        // longer entitled to. This is the signal that makes their client drop it.
        this.publish(grant.viewerId, "access.revoked");
        this.publish(user.id, "access.changed");
        return { ok: true };
    }

    /** Viewer withdrawing their own request, or giving up access they hold. */
    async withdraw(user: RequestUser, grantId: string) {
        const grant = await this.prisma.workoutAccessGrant.findFirst({
            where: { id: grantId, viewerId: user.id, status: { in: ["pending", "accepted"] } }
        });
        if (!grant) {
            throw new NotFoundException("Request not found");
        }
        // Set, never delete. The row carries rejectedCount and the cooldown, and deleting
        // it would let cancel-then-ask-again reset the escalation ladder and the daily
        // quota with one extra tap.
        await this.prisma.workoutAccessGrant.updateMany({
            where: { id: grantId, viewerId: user.id, status: grant.status },
            data: { status: "rejected", decidedAt: new Date(), cooldownUntil: null }
        });
        this.publish(grant.ownerId, "access.changed");
        this.publish(user.id, "access.changed");
        return { ok: true };
    }

    private publish(userId: string, name: "access.changed" | "access.revoked") {
        try {
            this.live.publish(userId, { name, at: new Date().toISOString() });
        } catch (error) {
            // A notification failure must never fail the decision it is reporting.
        }
    }

    private async notifyOwner(ownerId: string, viewer: RequestUser) {
        await this.deliver(ownerId, {
            type: "access_request",
            actorId: viewer.id,
            preview: `${viewer.displayName} просить доступ до твоїх тренувань`,
            url: "#/profile"
        });
    }

    private async notifyViewerGranted(viewerId: string, owner: RequestUser) {
        await this.deliver(viewerId, {
            type: "access_granted",
            actorId: owner.id,
            preview: `${owner.displayName} відкрив тобі свої тренування`,
            url: `#/user/${owner.id}`
        });
    }

    private async deliver(
        userId: string,
        input: { type: string; actorId: string; preview: string; url: string }
    ) {
        try {
            await this.prisma.notification.create({
                data: {
                    userId,
                    actorId: input.actorId,
                    type: input.type,
                    targetType: "access",
                    targetId: input.actorId,
                    preview: input.preview.slice(0, 240)
                }
            });
            await this.push.sendToUser(userId, input.type, {
                title: "GymOS",
                body: input.preview,
                url: input.url
            });
        } catch (error) {
            this.logger.warn(`access notify failed: ${(error as Error).message}`);
        }
    }
}
