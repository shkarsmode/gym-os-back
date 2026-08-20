import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../shared/current-user.decorator";
import { PushService } from "../feed/push.service";
import { LiveBus } from "./live.bus";

/**
 * Training together: two people watching each other's sets as they happen.
 *
 * Read-only by default, and editable only if the OWNER opens their own session — a flag
 * per direction, each writable by the person whose data it exposes. This became buildable
 * once set ids stopped being regenerated on every save: before that there was no stable
 * handle to address "this set" with, and an edit could only have been by POSITION,
 * rewriting whatever happened to land in that slot by the time the request arrived.
 *
 * A partner's writes go through the narrow targeted routes only, never saveFull: that one
 * deletes the whole tree and recreates it, and with status "active" also closes every
 * other session its owner has open. Handing it to somebody else would be handing them
 * "erase this person's workout".
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
                // Named from THIS person's point of view, because that is how the switch
                // in front of them reads: "may they edit mine" is the one they control,
                // "may I edit theirs" is the one the other person controls.
                partnerCanEditMine: iAmHost ? row.guestCanEdit : row.hostCanEdit,
                iCanEditTheirs: iAmHost ? row.hostCanEdit : row.guestCanEdit,
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
        // What these two settled on last time. Somebody who has already been trusted to
        // edit does not have to be granted again on every session — and revoking last
        // time is remembered just as faithfully.
        const previous = await this.prisma.trainingPartnership.findFirst({
            where: {
                status: "ended",
                OR: [
                    { hostId: user.id, guestId: partnerId },
                    { hostId: partnerId, guestId: user.id }
                ]
            },
            orderBy: { endedAt: "desc" },
            select: { hostId: true, guestCanEdit: true, hostCanEdit: true }
        }).catch(() => null);
        // The stored flags are relative to the OLD row's host/guest, which may be the
        // other way round this time.
        const sameOrientation = !previous || previous.hostId === user.id;
        const created = await this.prisma.trainingPartnership.create({
            data: {
                hostId: user.id,
                guestId: partnerId,
                status: "pending",
                guestCanEdit: previous ? (sameOrientation ? previous.guestCanEdit : previous.hostCanEdit) : false,
                hostCanEdit: previous ? (sameOrientation ? previous.hostCanEdit : previous.guestCanEdit) : false
            }
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
     * Open or close YOUR OWN session to the person you are training with.
     *
     * The flag a caller may write is always the one that grants access to their own data:
     * the host sets `guestCanEdit`, the guest sets `hostCanEdit`. A single call that took
     * both would let either side grant themselves access to the other's workout with no
     * consent from the person who owns it.
     */
    async setEditRight(user: RequestUser, id: string, allow: boolean) {
        const row = await this.prisma.trainingPartnership.findFirst({
            where: { id, status: "active", OR: [{ hostId: user.id }, { guestId: user.id }] }
        });
        if (!row) {
            throw new NotFoundException("Session not found");
        }
        const iAmHost = row.hostId === user.id;
        await this.prisma.trainingPartnership.updateMany({
            where: { id, status: "active" },
            data: iAmHost ? { guestCanEdit: allow } : { hostCanEdit: allow }
        });
        const other = iAmHost ? row.guestId : row.hostId;
        if (allow) {
            await this.notify(other, {
                type: "partner_edit_granted",
                actorId: user.id,
                preview: `${user.displayName} дозволив редагувати своє тренування`
            });
        }
        this.publish([row.hostId, row.guestId], "partner.changed");
        return { ok: true };
    }

    /**
     * May this person edit that person's sets right now?
     *
     * Re-read on EVERY write, never cached: ending the session or flipping the switch has
     * to take effect immediately, and a right resolved once at the start of a session is
     * a right that outlives being taken away.
     */
    async canEdit(actorId: string, ownerId: string): Promise<boolean> {
        const row = await this.prisma.trainingPartnership.findFirst({
            where: {
                status: "active",
                OR: [
                    { hostId: ownerId, guestId: actorId },
                    { hostId: actorId, guestId: ownerId }
                ]
            },
            select: { hostId: true, guestCanEdit: true, hostCanEdit: true }
        });
        if (!row) {
            return false;
        }
        // The owner is the host: the guest edits only if the host allowed it.
        return row.hostId === ownerId ? row.guestCanEdit : row.hostCanEdit;
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
