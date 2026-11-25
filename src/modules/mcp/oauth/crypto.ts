import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}

const PKCE_VALUE = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isPkceValue(value: unknown): value is string {
    return typeof value === "string" && PKCE_VALUE.test(value);
}

export function pkceChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: unknown, challenge: string): boolean {
    return isPkceValue(verifier) && safeEqual(pkceChallenge(verifier), challenge);
}
