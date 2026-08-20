import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { PushService } from "../feed/push.service";
import { LiveBus } from "./live.bus";

/**
 * Training together: two people watching each other's sets as they happen.
 *
 * READ-ONLY in both directions. Editing a partner's session is not merely unbuilt — it is
 * not currently possible to build honestly: `saveFull` regenerates every set and exercise
 * id on each save, so there is no stable handle to address "this set" with, and any
 * edit-by-position would rewrite whatever happened to be in that slot by the time it
 * arrived. Stable ids are the prerequisite; until then a partner watches.
 *
 * What travels is a HINT, exactly like everything else on this stream: "your partner's
 * session moved". The watcher answers by re-reading through GET /workouts/:id, which is
 * authorized on its own — so this cannot become a way to see something a plain request
 * would refuse.
 */
@Injectable()
export class PartnerService {
    private readonly logger = new Logger(PartnerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly bus: LiveBus,
        private readonly push: PushService
    ) {}

    /** The invitation or session this person is currently part of, from their side. */
    async current(user: RequestUser) {
        const row = await this.prisma.trainingPartnership.findFirst({
            where: {
                status: { in: ["pending", "active"] },
                OR: [{ hostId: user.id }, { guestId: user.id }]
            },
            orderBy: { createdAt: "desc" },
            include: {
                host: { select: { id: true, displayName: true, avatarUrl: true } },
                guest: { select: { id: true, displayName: true, avatarUrl: true } }
            }
        });
        if (!row) {
            return { partnership: null };
        }
        const iAmHost = row.hostId === user.id;
        const partner = iAmHost ? row.guest : row.host;
        return {
            partnership: {
                id: row.id,
                status: row.status,
                // "Did I send this or receive it" decides whether the UI offers Accept or
                // Cancel, and it is the one thing the row itself cannot say.
                incoming: !iAmHost && row.status === "pending",
                partner,
                startedAt: row.startedAt?.toISOString() || null
            }
        };
    }

    async invite(user: RequestUser, partnerId: string) {
        if (partnerId === user.id) {
            throw new BadRequestException("Cannot train with yourself");
        }
        const partner = await this.prisma.user.findUnique({
            where: { id: partnerId },
            select: { id: true, displayName: true }
        });
        if (!partner) {
            throw new NotFoundException("Member not found");
        }
        // One at a time, for either side. A person cannot be in two joint sessions, and
        // an outstanding invitation blocks a second one rather than queueing it.
        const busy = await this.prisma.trainingPartnership.findFirst({
            where: {
                status: { in: ["pending", "active"] },
                OR: [
                    { hostId: user.id }, { guestId: user.id },
                    { hostId: partnerId }, { guestId: partnerId }
                ]
            }
        });
        if (busy) {
            const mine = busy.hostId === user.id || busy.guestId === user.id;
            throw new BadRequestException(
                mine
                    ? "Ти вже у спільній сесії"
                    : "Ця людина вже тренується з кимось"
            );
        }
        const created = await this.prisma.trainingPartnership.create({
            data: { hostId: user.id, guestId: partnerId, status: "pending" }
        });
        await this.notify(partnerId, {
            type: "partner_invite",
            actorId: user.id,
            preview: `${user.displayName} кличе потренуватися разом`
        });
        this.publish([partnerId, user.id], "partner.changed");
        return { ok: true, id: created.id };
    }

    async accept(user: RequestUser, id: string) {
        // Scoped to the GUEST: the person who sent the invitation must not be able to
        // answer it on the other person's behalf.
        const { count } = await this.prisma.trainingPartnership.updateMany({
            where: { id, guestId: user.id, status: "pending" },
            data: { status: "active", startedAt: new Date() }
        });
        if (!count) {
            throw new NotFoundException("Invitation not found");
        }
        const row = await this.prisma.trainingPartnership.findUnique({ where: { id } });
        if (row) {
            await this.notify(row.hostId, {
                type: "partner_joined",
                actorId: user.id,
                preview: `${user.displayName} приєднався до спільної сесії`
            });
            this.publish([row.hostId, row.guestId], "partner.changed");
        }
        return { ok: true };
    }

    /** Declining an invitation, or ending a session — either side, at any time. */
    async leave(user: RequestUser, id: string) {
        const row = await this.prisma.trainingPartnership.findFirst({
            where: {
                id,
                status: { in: ["pending", "active"] },
                OR: [{ hostId: user.id }, { guestId: user.id }]
            }
        });
        if (!row) {
            throw new NotFoundException("Session not found");
        }
        await this.prisma.trainingPartnership.updateMany({
            where: { id, status: row.status },
            data: { status: "ended", endedAt: new Date() }
        });
        // Both sides are told, because the other one is looking at a live panel that has
        // just stopped being live.
        this.publish([row.hostId, row.guestId], "partner.changed");
        return { ok: true };
    }

    /**
     * The partner id this person is actively training with, or null.
     *
     * Used by the read path: an active partnership is consent to show the OTHER PERSON'S
     * ACTIVE SESSION, and nothing else. It is not a standing grant — it lasts as long as
     * the session does, and it does not reach their history.
     */
    async activePartnerOf(userId: string): Promise<string | null> {
        const row = await this.prisma.trainingPartnership.findFirst({
            where: { status: "active", OR: [{ hostId: userId }, { guestId: userId }] },
            select: { hostId: true, guestId: true }
        });
        if (!row) {
            return null;
        }
        return row.hostId === userId ? row.guestId : row.hostId;
    }

    /** Tell a partner that this person's session moved, so their panel re-reads it. */
    async announceWorkout(userId: string, workoutId: string) {
        const partnerId = await this.activePartnerOf(userId).catch(() => null);
        if (!partnerId) {
            return;
        }
        this.bus.publish(partnerId, {
            name: "partner.workout",
            ids: [workoutId],
            at: new Date().toISOString()
        });
    }

    private publish(userIds: string[], name: "partner.changed") {
        for (const id of new Set(userIds)) {
            try {
                this.bus.publish(id, { name, at: new Date().toISOString() });
            } catch (error) {
                // Never let a notification failure fail the decision it reports.
            }
        }
    }

    private async notify(userId: string, input: { type: string; actorId: string; preview: string }) {
        try {
            await this.prisma.notification.create({
                data: {
                    userId,
                    actorId: input.actorId,
                    type: input.type,
                    targetType: "partner",
                    targetId: input.actorId,
                    preview: input.preview.slice(0, 240)
                }
            });
            await this.push.sendToUser(userId, input.type, {
                title: "GymOS",
                body: input.preview,
                url: "#/workout"
            });
        } catch (error) {
            this.logger.warn(`partner notify failed: ${(error as Error).message}`);
        }
    }
}
