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
