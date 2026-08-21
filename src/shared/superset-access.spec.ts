import { ForbiddenException } from "@nestjs/common";
import { assertSupersetTier, canCreateSupersets, newSupersetGroupIds } from "./superset-access";

/**
 * The tier rule is about CREATING a superset, not about having one.
 *
 * A plan ending must never take training away, so a workout that already contains a
 * group keeps saving after a downgrade — including the autosaves that fire while
 * somebody merely looks at it. Enforcing "has none" instead of "adds none" would make
 * every one of those autosaves a 403 and strand the session.
 */
describe("newSupersetGroupIds", () => {
    it("names only the groups that were not there before", () => {
        expect(newSupersetGroupIds({ requestedGroupIds: ["a", "b"], existingGroupIds: ["a"] })).toEqual(["b"]);
    });

    it("counts a repeated id once", () => {
        expect(newSupersetGroupIds({ requestedGroupIds: ["b", "b"], existingGroupIds: [] })).toEqual(["b"]);
    });

    it("is empty when nothing is introduced", () => {
        expect(newSupersetGroupIds({ requestedGroupIds: ["a"], existingGroupIds: ["a", "b"] })).toEqual([]);
        expect(newSupersetGroupIds({ requestedGroupIds: [], existingGroupIds: [] })).toEqual([]);
    });
});

describe("canCreateSupersets", () => {
    it("is a PRO feature", () => {
        expect(canCreateSupersets("premium")).toBe(true);
        expect(canCreateSupersets("admin")).toBe(true);
        expect(canCreateSupersets("free")).toBe(false);
    });
});

describe("assertSupersetTier", () => {
    it("throws for a free account introducing a group", () => {
        expect(() => assertSupersetTier("free", { requestedGroupIds: ["new"], existingGroupIds: [] }))
            .toThrow(ForbiddenException);
    });

    it("says which feature was refused, so the client can open the right paywall", () => {
        try {
            assertSupersetTier("free", { requestedGroupIds: ["new"], existingGroupIds: [] });
            throw new Error("expected a refusal");
        } catch (error: any) {
            expect(error.getResponse().code).toBe("SUPERSET_REQUIRES_PRO");
        }
    });

    it("lets a free account keep saving the group it already had", () => {
        expect(() => assertSupersetTier("free", { requestedGroupIds: ["a"], existingGroupIds: ["a"] })).not.toThrow();
    });

    it("lets a free account save a workout with no groups at all", () => {
        expect(() => assertSupersetTier("free", { requestedGroupIds: [], existingGroupIds: [] })).not.toThrow();
    });

    it("never stands in the way of PRO or admin", () => {
        expect(() => assertSupersetTier("premium", { requestedGroupIds: ["new"], existingGroupIds: [] })).not.toThrow();
        expect(() => assertSupersetTier("admin", { requestedGroupIds: ["new"], existingGroupIds: [] })).not.toThrow();
    });
});
