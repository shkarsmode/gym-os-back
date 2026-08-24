import {
    isDevDatabaseHost, devLoginAllowed, configuredAdminEmails, canAssumeAccount,
    MIN_DEV_LOGIN_SECRET_LENGTH
} from "./dev-environment";

const SECRET = "s3cret-long-enough-to-count";
const PROD = "postgresql://gymos:pw@gymos-db:5432/gymos?schema=public";
const DEV = "postgresql://gymos:pw@gymos-db-dev:5432/gymos?schema=public";

describe("isDevDatabaseHost", () => {
    it("accepts only a host that ends in -dev", () => {
        expect(isDevDatabaseHost(DEV)).toBe(true);
        expect(isDevDatabaseHost(PROD)).toBe(false);
    });

    it("is not fooled by -dev appearing anywhere else in the URL", () => {
        // The database NAME is the same in both environments, so a check that looked at
        // the whole string rather than the hostname would pass on production.
        expect(isDevDatabaseHost("postgresql://gymos:pw@gymos-db:5432/gymos-dev")).toBe(false);
        expect(isDevDatabaseHost("postgresql://dev:pw@gymos-db:5432/gymos?opt=dev")).toBe(false);
        expect(isDevDatabaseHost("postgresql://gymos:pw@gymos-db:5432/gymos?schema=dev")).toBe(false);
    });

    it("treats a managed/external host as production", () => {
        expect(isDevDatabaseHost("postgresql://u:p@ep-cool.eu-central-1.aws.neon.tech/gymos")).toBe(false);
    });

    it("fails CLOSED on anything it cannot read", () => {
        expect(isDevDatabaseHost(undefined)).toBe(false);
        expect(isDevDatabaseHost("")).toBe(false);
        expect(isDevDatabaseHost("not a url at all")).toBe(false);
    });
});

describe("devLoginAllowed", () => {
    it("needs the dev host, a configured secret, and a matching one", () => {
        expect(devLoginAllowed(DEV, SECRET, SECRET)).toBe(true);
    });

    it("refuses on production no matter what secret is presented", () => {
        // The property that matters most: this route must be unreachable in production
        // even if the secret leaks, even if it is deliberately configured there.
        expect(devLoginAllowed(PROD, SECRET, SECRET)).toBe(false);
    });

    it("refuses when no secret is configured, so it cannot be left open by accident", () => {
        expect(devLoginAllowed(DEV, undefined, "")).toBe(false);
        expect(devLoginAllowed(DEV, "", "")).toBe(false);
    });

    it("refuses a secret short enough to guess", () => {
        const short = "a".repeat(MIN_DEV_LOGIN_SECRET_LENGTH - 1);
        expect(devLoginAllowed(DEV, short, short)).toBe(false);
        const long = "a".repeat(MIN_DEV_LOGIN_SECRET_LENGTH);
        expect(devLoginAllowed(DEV, long, long)).toBe(true);
    });

    it("refuses a wrong, missing, prefix or padded secret", () => {
        expect(devLoginAllowed(DEV, SECRET, undefined)).toBe(false);
        expect(devLoginAllowed(DEV, SECRET, "")).toBe(false);
        expect(devLoginAllowed(DEV, SECRET, SECRET.slice(0, -1))).toBe(false);
        expect(devLoginAllowed(DEV, SECRET, SECRET + "x")).toBe(false);
        expect(devLoginAllowed(DEV, SECRET, SECRET.toUpperCase())).toBe(false);
    });

    it("ignores surrounding whitespace, which a copy-paste always brings", () => {
        expect(devLoginAllowed(DEV, ` ${SECRET} `, `\n${SECRET}\t`)).toBe(true);
    });
});

describe("canAssumeAccount", () => {
    const admins = configuredAdminEmails("boss@example.com", "owner@example.com");

    it("allows a generated account", () => {
        expect(canAssumeAccount({ id: "dev-u-007", email: "dev.007@dev.gymos.invalid" }, admins)).toBe(true);
    });

    it("allows a configured administrator and the owner", () => {
        expect(canAssumeAccount({ id: "real-id", email: "boss@example.com" }, admins)).toBe(true);
        expect(canAssumeAccount({ id: "real-id", email: "OWNER@example.com" }, admins)).toBe(true);
    });

    it("refuses an ordinary account even on a dev host", () => {
        // The secret is not supposed to be enough to become anybody — that is what keeps
        // "somebody found the secret" from being the same as "somebody is the owner".
        expect(canAssumeAccount({ id: "real-id", email: "member@example.com" }, admins)).toBe(false);
        expect(canAssumeAccount({ id: "real-id", email: "" }, admins)).toBe(false);
        expect(canAssumeAccount(null, admins)).toBe(false);
    });

    it("is not fooled by an id that merely contains dev-", () => {
        expect(canAssumeAccount({ id: "not-a-dev-user", email: "x@example.com" }, admins)).toBe(false);
    });
});

describe("configuredAdminEmails", () => {
    it("always includes the owner, and never duplicates it", () => {
        expect(configuredAdminEmails("", "owner@example.com")).toEqual(["owner@example.com"]);
        expect(configuredAdminEmails("owner@example.com", "owner@example.com")).toEqual(["owner@example.com"]);
    });

    it("lowercases and trims a comma-separated list", () => {
        expect(configuredAdminEmails(" A@x.com , B@x.com ", "owner@x.com"))
            .toEqual(["a@x.com", "b@x.com", "owner@x.com"]);
    });
});
