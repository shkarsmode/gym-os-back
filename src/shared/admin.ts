export type AdminCandidate = {
    email?: string | null;
    id?: string | null;
    role?: string | null;
} | null | undefined;

// Super-admin check: zshkarrr@gmail.com (DEMO_OWNER_EMAIL default) plus anything in
// ADMIN_EMAILS / DEMO_OWNER_USER_ID. Admins bypass ownership and approval checks.
// Email-based super-admins can never be locked out via the role column.
export function isSuperAdminUser(user: AdminCandidate): boolean {
    if (!user) {
        return false;
    }
    const adminEmails = String(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    const demoOwnerEmail = String(process.env.DEMO_OWNER_EMAIL || "zshkarrr@gmail.com").trim().toLowerCase();
    const demoOwnerUserId = String(process.env.DEMO_OWNER_USER_ID || "").trim();
    const email = String(user.email || "").trim().toLowerCase();

    if (email && (adminEmails.includes(email) || email === demoOwnerEmail)) {
        return true;
    }
    if (demoOwnerUserId && user.id === demoOwnerUserId) {
        return true;
    }
    return false;
}

// Admin = super-admin (by email) OR a user promoted to role "admin" via the panel.
export function isAdminUser(user: AdminCandidate): boolean {
    if (!user) {
        return false;
    }
    return isSuperAdminUser(user) || String(user.role || "").toLowerCase() === "admin";
}

// Unlimited quota = admins and premium users; free users hit the limits.
// NOTE: kept for legacy callers. New quota code uses tierOf() — PRO is now bounded
// (not unlimited), so quota checks must distinguish premium from admin.
export function hasUnlimitedQuota(user: AdminCandidate): boolean {
    const role = String(user?.role || "").toLowerCase();
    return isAdminUser(user) || role === "premium";
}

export type QuotaTier = "admin" | "premium" | "free";

// The billing tier that drives per-user quotas. admin = unlimited; premium = PRO
// (higher but bounded); free = base limits.
export function tierOf(user: AdminCandidate): QuotaTier {
    if (isAdminUser(user)) {
        return "admin";
    }
    if (String(user?.role || "").toLowerCase() === "premium") {
        return "premium";
    }
    return "free";
}
