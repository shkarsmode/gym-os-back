import { PartnerService } from "./partner.service";
import { LiveBus } from "./live.bus";
import { PrismaService } from "../../prisma/prisma.service";
import { PushService } from "../feed/push.service";
import { RequestUser } from "../../shared/current-user.decorator";

const HOST: RequestUser = { id: "host", email: "h@example.com", displayName: "Host" };
const GUEST: RequestUser = { id: "guest", email: "g@example.com", displayName: "Guest" };

function createService(rows: any[] = []) {
    const updates: any[] = [];
    const prisma: any = {
        user: { findUnique: async ({ where }: any) => ({ id: where.id, displayName: where.id }) },
        notification: { create: async () => ({}) },
        trainingPartnership: {
            findFirst: async ({ where }: any) => {
                // Good enough for the scoping questions these tests ask: match on id and
                // on whichever side the caller claims to be.
                return rows.find((row) => {
                    if (where.id && row.id !== where.id) return false;
                    if (where.status?.in && !where.status.in.includes(row.status)) return false;
                    if (where.status === "active" && row.status !== "active") return false;
                    if (where.OR) {
                        return where.OR.some((clause: any) =>
                            (clause.hostId && clause.hostId === row.hostId)
                            || (clause.guestId && clause.guestId === row.guestId));
                    }
                    return true;
                }) || null;
            },
            findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) || null,
            create: async ({ data }: any) => ({ id: "new", ...data }),
            updateMany: async ({ where, data }: any) => {
                updates.push({ where, data });
                const hit = rows.find((row) =>
                    row.id === where.id
                    && (!where.guestId || row.guestId === where.guestId)
                    && (!where.status || row.status === where.status));
                return { count: hit ? 1 : 0 };
            }
        }
    };
    const push = { sendToUser: async () => undefined } as unknown as PushService;
    return { service: new PartnerService(prisma as PrismaService, new LiveBus(), push), updates };
}

describe("inviting someone to train together", () => {
    it("refuses to invite yourself", async () => {
        const { service } = createService();
        await expect(service.invite(HOST, HOST.id)).rejects.toThrow();
    });

    it("refuses a second session while one is already running", async () => {
        // One at a time on either side: a person cannot be in two joint sessions, and an
        // outstanding invitation blocks a second rather than queueing it.
        const { service } = createService([{ id: "p1", hostId: "host", guestId: "other", status: "active" }]);
        await expect(service.invite(HOST, GUEST.id)).rejects.toThrow();
    });
});

describe("answering an invitation", () => {
    it("only the GUEST may accept", async () => {
        // Otherwise the person who sent it answers on the other's behalf.
        const { service } = createService([{ id: "p1", hostId: "host", guestId: "guest", status: "pending" }]);
        await expect(service.accept(HOST, "p1")).rejects.toThrow();
        await expect(service.accept(GUEST, "p1")).resolves.toEqual({ ok: true });
    });

    it("accepting is scoped to a still-pending row", async () => {
        const { service, updates } = createService([{ id: "p1", hostId: "host", guestId: "guest", status: "pending" }]);
        await service.accept(GUEST, "p1");
        // A conditional update, not a read followed by a write: two taps racing must not
        // both succeed.
        expect(updates[0].where).toMatchObject({ id: "p1", guestId: "guest", status: "pending" });
    });

    it("either side may end it", async () => {
        const rows = [{ id: "p1", hostId: "host", guestId: "guest", status: "active" }];
        await expect(createService(rows).service.leave(HOST, "p1")).resolves.toEqual({ ok: true });
        await expect(createService(rows).service.leave(GUEST, "p1")).resolves.toEqual({ ok: true });
    });
});

describe("who may watch whom", () => {
    it("names the other side of an active session", async () => {
        const { service } = createService([{ id: "p1", hostId: "host", guestId: "guest", status: "active" }]);
        await expect(service.activePartnerOf("host")).resolves.toBe("guest");
        await expect(service.activePartnerOf("guest")).resolves.toBe("host");
    });

    it("nobody, when there is no active session", async () => {
        // A pending invitation is not consent yet.
        const { service } = createService([{ id: "p1", hostId: "host", guestId: "guest", status: "pending" }]);
        await expect(service.activePartnerOf("host")).resolves.toBeNull();
    });

    it("nobody, for someone not in it", async () => {
        const { service } = createService([{ id: "p1", hostId: "host", guestId: "guest", status: "active" }]);
        await expect(service.activePartnerOf("stranger")).resolves.toBeNull();
    });
});

describe("edit rights", () => {
    function withFlags(row: any) {
        const updates: any[] = [];
        const prisma: any = {
            user: { findUnique: async ({ where }: any) => ({ id: where.id, displayName: where.id }) },
            notification: { create: async () => ({}) },
            trainingPartnership: {
                findFirst: async ({ where }: any) => {
                    if (where.id && row.id !== where.id) return null;
                    if (where.status === "active" && row.status !== "active") return null;
                    if (where.OR) {
                        const ok = where.OR.some((clause: any) =>
                            (clause.hostId === undefined || clause.hostId === row.hostId)
                            && (clause.guestId === undefined || clause.guestId === row.guestId));
                        if (!ok) return null;
                    }
                    return row;
                },
                findUnique: async () => row,
                create: async ({ data }: any) => ({ id: "new", ...data }),
                updateMany: async ({ where, data }: any) => {
                    updates.push({ where, data });
                    return { count: 1 };
                }
            }
        };
        const push = { sendToUser: async () => undefined } as unknown as PushService;
        return { service: new PartnerService(prisma as PrismaService, new LiveBus(), push), updates };
    }

    const ACTIVE = { id: "p1", hostId: "host", guestId: "guest", status: "active", guestCanEdit: false, hostCanEdit: false };

    it("the host opens THEIR OWN session, which is the guest's right to edit", async () => {
        // The flag a caller may write is always the one granting access to their own
        // data. Taking both in one call would let either side grant themselves access to
        // the other's workout with nobody consenting.
        const { service, updates } = withFlags({ ...ACTIVE });
        await service.setEditRight(HOST, "p1", true);
        expect(updates[0].data).toEqual({ guestCanEdit: true });
    });

    it("the guest opens their own, which is the host's right to edit", async () => {
        const { service, updates } = withFlags({ ...ACTIVE });
        await service.setEditRight(GUEST, "p1", true);
        expect(updates[0].data).toEqual({ hostCanEdit: true });
    });

    it("a stranger cannot touch either flag", async () => {
        const { service } = withFlags({ ...ACTIVE });
        await expect(service.setEditRight({ id: "nobody", email: "n@e.com", displayName: "N" }, "p1", true))
            .rejects.toThrow();
    });

    it("says no when the owner has not opened their session", async () => {
        const { service } = withFlags({ ...ACTIVE });
        await expect(service.canEdit("guest", "host")).resolves.toBe(false);
    });

    it("says yes only in the direction that was granted", async () => {
        const { service } = withFlags({ ...ACTIVE, guestCanEdit: true });
        // The host opened theirs: the guest may edit the host's.
        await expect(service.canEdit("guest", "host")).resolves.toBe(true);
        // The reverse was never granted.
        await expect(service.canEdit("host", "guest")).resolves.toBe(false);
    });

    it("says no once the session has ended", async () => {
        // Re-read on every write precisely so a right cannot outlive being taken away.
        const { service } = withFlags({ ...ACTIVE, status: "ended", guestCanEdit: true });
        await expect(service.canEdit("guest", "host")).resolves.toBe(false);
    });
});
