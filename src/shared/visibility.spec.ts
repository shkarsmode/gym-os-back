import { Visibility } from "./visibility";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "./current-user.decorator";

const CALLER: RequestUser = { id: "me", email: "me@example.com", displayName: "Me" };

function createPrisma(options: { denied?: string[]; privateUsers?: string[]; fail?: boolean; failFallback?: boolean } = {}) {
    let call = 0;
    const prisma: any = {
        user: {
            findMany: async () => {
                call += 1;
                if (call === 1) {
                    if (options.fail) {
                        throw new Error("relation \"WorkoutAccessGrant\" does not exist");
                    }
                    return (options.denied || []).map((id) => ({ id }));
                }
                if (options.failFallback) {
                    throw new Error("database is down");
                }
                return (options.privateUsers || []).map((id) => ({ id }));
            }
        }
    };
    return prisma as PrismaService;
}

describe("Visibility", () => {
    it("always lets the caller see their own detail", async () => {
        const visibility = await Visibility.resolve(createPrisma({ denied: ["me"] }), CALLER);
        expect(visibility.canSeeDetail("me")).toBe(true);
    });

    it("hides a private owner who has not granted this caller", async () => {
        const visibility = await Visibility.resolve(createPrisma({ denied: ["shy"] }), CALLER);
        expect(visibility.canSeeDetail("shy")).toBe(false);
        expect(visibility.hiddenOwnerIds()).toEqual(["shy"]);
    });

    it("shows a public member, and a private one who accepted", async () => {
        // The query returns only private owners WITHOUT an accepted grant, so anyone
        // absent from it is visible.
        const visibility = await Visibility.resolve(createPrisma({ denied: ["shy"] }), CALLER);
        expect(visibility.canSeeDetail("public-person")).toBe(true);
        expect(visibility.canSeeDetail("granted-me-access")).toBe(true);
    });

    it("partitions owner ids in one pass", async () => {
        const visibility = await Visibility.resolve(createPrisma({ denied: ["shy", "quiet"] }), CALLER);
        const { visible, hidden } = visibility.partition(["shy", "open", "quiet", "open", "me"]);
        expect(new Set(hidden)).toEqual(new Set(["shy", "quiet"]));
        expect(new Set(visible)).toEqual(new Set(["open", "me"]));
    });

    describe("when the grant table cannot be read", () => {
        it("FAILS CLOSED — denies every private owner rather than guessing", async () => {
            // ensureSchema swallows its own failures and only logs, so a database missing
            // the grant table boots a healthy-looking app. Treating that as "nobody is
            // private" would turn one logged DDL error into a silent full-gym leak.
            const visibility = await Visibility.resolve(
                createPrisma({ fail: true, privateUsers: ["shy", "quiet"] }),
                CALLER
            );
            expect(visibility.canSeeDetail("shy")).toBe(false);
            expect(visibility.canSeeDetail("quiet")).toBe(false);
            expect(visibility.canSeeDetail("open")).toBe(true);
        });

        it("throws rather than guess when even the fallback fails", async () => {
            await expect(Visibility.resolve(createPrisma({ fail: true, failFallback: true }), CALLER))
                .rejects.toThrow();
        });
    });

    describe("admins", () => {
        const admin: RequestUser = { id: "boss", email: "zshkarrr@gmail.com", displayName: "Boss" };

        it("see everything, as they do everywhere else in the app", async () => {
            const visibility = await Visibility.resolve(createPrisma({ denied: ["shy"] }), admin);
            expect(visibility.canSeeDetail("shy")).toBe(true);
        });

        it("but NOT while impersonating — that session is the target's, not theirs", async () => {
            // Otherwise impersonation is a privilege-escalation primitive: act as anyone,
            // and read what only an admin may read.
            const impersonating: RequestUser = { ...admin, impersonatedBy: "boss" };
            const visibility = await Visibility.resolve(createPrisma({ denied: ["shy"] }), impersonating);
            expect(visibility.canSeeDetail("shy")).toBe(false);
        });
    });

    it("ownerOnly permits everything, and is only for genuinely own-scoped reads", async () => {
        const visibility = Visibility.ownerOnly("me");
        expect(visibility.canSeeDetail("anyone")).toBe(true);
        expect(visibility.hidesAnyone).toBe(false);
    });
});
