// How long a sign-in lasts, and when it is renewed.
//
// A session is a JWT held twice: in the httpOnly cookie and in the SPA's localStorage
// (iOS Safari blocks the cross-site cookie, so the Bearer copy is what most phones use).
// It used to be minted once, at login, for 14 days and never renewed — so the app signed
// everybody out a fortnight after they last signed in, however often they trained.
//
// Now it lasts half a year and slides: /auth/me (called on every app start and when the
// app comes back to the foreground) hands back a fresh token once the presented one is
// a day old. A device that opens the app at least once in six months stays signed in;
// one left unused for longer is signed out.

export const SESSION_TTL_DAYS = 180;
export const SESSION_TTL = `${SESSION_TTL_DAYS}d`;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Renewing on every request would mint a token per call; once a day is plenty to slide a half-year session. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionClaims {
    sub: string;
    /** Seconds since the epoch, set by jsonwebtoken on every token it signs. */
    iat?: number;
    /** Present on an impersonation session — the admin behind it. */
    imp?: string;
}

/**
 * Whether /auth/me should swap the presented token for a fresh half-year one.
 *
 * Never for an impersonation session: those expire after 60 minutes on purpose, so a
 * forgotten one dies on its own — renewing it would turn it into a six-month key to
 * somebody else's account.
 */
export function shouldRenewSession(claims: SessionClaims | null | undefined, now = Date.now()): boolean {
    if (!claims?.sub || claims.imp || typeof claims.iat !== "number") {
        return false;
    }
    return now - claims.iat * 1000 >= SESSION_RENEW_AFTER_MS;
}
