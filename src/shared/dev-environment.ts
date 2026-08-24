/**
 * "Is this a development deployment, and may this caller act on it?"
 *
 * Pulled out of the controller so the security properties can be tested directly rather
 * than through an HTTP round trip. Every one of these is a rule that must not quietly
 * change, and a rule that cannot be asserted on is a rule that will.
 */

/**
 * Production and development share the database NAME (`gymos`); only the host differs
 * (`gymos-db` vs `gymos-db-dev`). So the host is the only honest signal, and anything that
 * is not clearly a development host is treated as production.
 */
export function isDevDatabaseHost(databaseUrl: string | undefined): boolean {
    if (!databaseUrl) {
        return false;
    }
    try {
        return /-dev(\b|$)/.test(new URL(databaseUrl).hostname);
    } catch {
        // An unparseable URL is not a development host. Failing closed is the only safe
        // reading of "I could not tell".
        return false;
    }
}

/** A secret short enough to guess is the same as no secret. */
export const MIN_DEV_LOGIN_SECRET_LENGTH = 16;

export function devLoginAllowed(
    databaseUrl: string | undefined,
    configuredSecret: string | undefined,
    offeredSecret: string | undefined
): boolean {
    if (!isDevDatabaseHost(databaseUrl)) {
        return false;
    }
    const expected = String(configuredSecret || "").trim();
    if (expected.length < MIN_DEV_LOGIN_SECRET_LENGTH) {
        return false;
    }
    return String(offeredSecret || "").trim() === expected;
}

export function configuredAdminEmails(adminEmails: string | undefined, ownerEmail: string | undefined): string[] {
    const list = String(adminEmails || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    const owner = String(ownerEmail || "zshkarrr@gmail.com").trim().toLowerCase();
    if (owner && !list.includes(owner)) {
        list.push(owner);
    }
    return list;
}

/**
 * Which accounts a dev login may assume.
 *
 * Only two: one of the generated people, or an address that is ALREADY an administrator
 * of this deployment. Without this the secret alone would be enough to manufacture any
 * identity, and "you need the secret" is a much weaker claim than "even with the secret
 * there is nothing worth stealing".
 */
export function canAssumeAccount(
    account: { id?: string | null; email?: string | null } | null,
    adminEmails: string[]
): boolean {
    if (!account) {
        return false;
    }
    if (String(account.id || "").startsWith("dev-")) {
        return true;
    }
    const email = String(account.email || "").trim().toLowerCase();
    return Boolean(email) && adminEmails.includes(email);
}
