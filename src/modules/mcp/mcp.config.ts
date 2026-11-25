export const MCP_SCOPES = ["gymos.read", "gymos.write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_CONFIG = Symbol("MCP_CONFIG");

export interface McpConfig {
    enabled: boolean;
    issuer: string;
    resource: string;
    allowedEmails: string[];
    allowedUserIds: string[];
    redirectUris: string[];
    allowedOrigins: string[];
    allowLoopback: boolean;
    timeZone: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    secureCookies: boolean;
    dcrEnabled: boolean;
    staticClient: { id: string; secret: string } | null;
}

const DEFAULT_REDIRECT_URIS = [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback"
];
const DEFAULT_ORIGINS = ["https://claude.ai", "https://claude.com"];
const DEFAULT_TIME_ZONE = "Europe/Kyiv";

function list(value: string | undefined): string[] {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function positive(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validTimeZone(value: string | undefined): string {
    const zone = String(value || "").trim() || DEFAULT_TIME_ZONE;
    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: zone });
        return zone;
    } catch {
        return DEFAULT_TIME_ZONE;
    }
}

export function isLoopbackHost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function isValidIssuer(issuer: string): boolean {
    try {
        const url = new URL(issuer);
        if (url.search || url.hash || url.pathname !== "/" || url.username || url.password) {
            return false;
        }
        return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname));
    } catch {
        return false;
    }
}

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
    const issuer = String(env.MCP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    const allowedEmails = list(env.MCP_ALLOWED_EMAILS).map((email) => email.toLowerCase());
    const allowedUserIds = list(env.MCP_ALLOWED_USER_IDS);
    const redirectUris = list(env.MCP_REDIRECT_URIS);
    const origins = list(env.MCP_ALLOWED_ORIGINS);
    const validIssuer = isValidIssuer(issuer);
    return {
        enabled: validIssuer && (allowedEmails.length > 0 || allowedUserIds.length > 0),
        issuer,
        resource: `${issuer}/mcp`,
        allowedEmails,
        allowedUserIds,
        redirectUris: redirectUris.length ? redirectUris : DEFAULT_REDIRECT_URIS,
        allowedOrigins: [...new Set([...(origins.length ? origins : DEFAULT_ORIGINS), ...(validIssuer ? [new URL(issuer).origin] : [])])],
        allowLoopback: String(env.MCP_ALLOW_LOOPBACK || "").trim().toLowerCase() === "true",
        timeZone: validTimeZone(env.MCP_TIMEZONE),
        accessTtlSeconds: Math.round(positive(env.MCP_ACCESS_TTL_MIN, 60) * 60),
        refreshTtlSeconds: Math.round(positive(env.MCP_REFRESH_TTL_DAYS, 30) * 86400),
        secureCookies: issuer.startsWith("https://"),
        dcrEnabled: String(env.MCP_DCR || "").trim().toLowerCase() !== "false",
        staticClient: env.MCP_CLIENT_ID && env.MCP_CLIENT_SECRET
            ? { id: String(env.MCP_CLIENT_ID).trim(), secret: String(env.MCP_CLIENT_SECRET) }
            : null
    };
}

export function isAllowedUser(config: McpConfig, user: { id?: string | null; emails: Array<string | null | undefined> }): boolean {
    if (user.id && config.allowedUserIds.includes(user.id)) {
        return true;
    }
    return user.emails.some((email) => {
        const normalized = String(email || "").trim().toLowerCase();
        return Boolean(normalized) && config.allowedEmails.includes(normalized);
    });
}

export function isAllowedOrigin(config: McpConfig, origin: string): boolean {
    if (config.allowedOrigins.includes(origin)) {
        return true;
    }
    if (!config.allowLoopback) {
        return false;
    }
    try {
        const url = new URL(origin);
        return url.protocol === "http:" && isLoopbackHost(url.hostname);
    } catch {
        return false;
    }
}

export function isMcpPath(path: string): boolean {
    return path === "/mcp" || path.startsWith("/mcp/") || path.startsWith("/.well-known/oauth-");
}
