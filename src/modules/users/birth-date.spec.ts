import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { deriveBirthYear } from "./users.service";

/**
 * Onboarding asks for a full date of birth; `birthYear` predates it and is what every
 * reader actually uses — the coach's recovery and strength-standard expectations among
 * them. So the year is DERIVED on write rather than taken from the client alongside the
 * date: two independently-supplied fields for one fact will eventually disagree, and the
 * disagreement shows up as a plan built for somebody a decade older.
 */
describe("deriveBirthYear", () => {
    it("takes the year from the date", () => {
        expect(deriveBirthYear("1998-04-17")).toBe(1998);
        expect(deriveBirthYear("2001-12-31")).toBe(2001);
    });

    it("returns null when there is nothing to derive from", () => {
        expect(deriveBirthYear(undefined)).toBeNull();
        expect(deriveBirthYear(null)).toBeNull();
        expect(deriveBirthYear("")).toBeNull();
    });

    it("refuses years that cannot be a date of birth", () => {
        expect(deriveBirthYear("1899-01-01")).toBeNull();
        expect(deriveBirthYear(`${new Date().getFullYear() + 1}-01-01`)).toBeNull();
        expect(deriveBirthYear("abcd-01-01")).toBeNull();
    });

    it("leaves an existing birthYear alone when no date is given", () => {
        // Null is the signal for "do not touch it" — profiles filled in before this
        // shipped keep the year they already have.
        expect(deriveBirthYear(undefined)).toBeNull();
    });
});

describe("birthDate on UpdateProfileDto", () => {
    const check = (value: unknown) =>
        validate(plainToInstance(UpdateProfileDto, { birthDate: value }), { whitelist: true, forbidNonWhitelisted: true });

    it("accepts YYYY-MM-DD", async () => {
        expect(await check("1998-04-17")).toHaveLength(0);
    });

    it("is optional, so every existing client still validates", async () => {
        const errors = await validate(plainToInstance(UpdateProfileDto, { height: 180 }), { whitelist: true, forbidNonWhitelisted: true });
        expect(errors).toHaveLength(0);
    });

    it("rejects anything that is not a plain date", async () => {
        for (const bad of ["17.04.1998", "1998-4-7", "1998-04-17T00:00:00Z", "not a date", 19980417]) {
            const errors = await check(bad);
            expect(errors.map((error) => error.property)).toContain("birthDate");
        }
    });
});
