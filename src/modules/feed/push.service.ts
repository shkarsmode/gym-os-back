import { Injectable, Logger } from "@nestjs/common";
import * as webpush from "web-push";
import { PrismaService } from "../../prisma/prisma.service";
import { PUSH_DEFAULTS } from "./feed.constants";

// Web Push delivery. Keys come from the environment; with none configured the whole
// module degrades to "in-app notifications only" instead of failing — a deploy
// without VAPID keys must not break commenting.
@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);
    private configured = false;

    constructor(private readonly prisma: PrismaService) {
        const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
        const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
        const subject = (process.env.VAPID_SUBJECT || "mailto:admin@gymos.app").trim();
        if (publicKey && privateKey) {
            try {
                webpush.setVapidDetails(subject, publicKey, privateKey);
                this.configured = true;
            } catch (error) {
                this.logger.warn(`VAPID setup failed: ${(error as Error).message}`);
            }
        }
    }

    isConfigured(): boolean {
        return this.configured;
    }

    publicKey(): string {
        return (process.env.VAPID_PUBLIC_KEY || "").trim();
    }

    async subscribe(userId: string, endpoint: string, p256dh: string, auth: string) {
        // Endpoint is unique: re-subscribing the same browser updates the keys and
        // re-points it at the current user rather than piling up dead rows.
        await this.prisma.pushSubscription.upsert({
            where: { endpoint },
            update: { userId, p256dh, auth },
            create: { userId, endpoint, p256dh, auth }
        });
        return { ok: true };
    }

    async unsubscribe(userId: string, endpoint?: string) {
        await this.prisma.pushSubscription.deleteMany({
            where: { userId, ...(endpoint ? { endpoint } : {}) }
        });
        return { ok: true };
    }

    // Per-category switches live in User.preferences.push. Unknown/unset categories
    // fall back to PUSH_DEFAULTS — direct interactions on, ambient activity off.
    private async allows(userId: string, type: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
        const preferences = (user?.preferences || {}) as Record<string, unknown>;
        const push = (preferences.push || {}) as Record<string, unknown>;
        if (push[type] === undefined || push[type] === null) {
            return PUSH_DEFAULTS[type] ?? false;
        }
        return push[type] === true || push[type] === "1";
    }

    async sendToUser(userId: string, type: string, payload: { title: string; body: string; url?: string }) {
        if (!this.configured) {
            return;
        }
        if (!(await this.allows(userId, type))) {
            return;
        }
        const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
        if (!subscriptions.length) {
            return;
        }
        const message = JSON.stringify({ ...payload, type });
        await Promise.all(subscriptions.map(async (subscription) => {
            try {
                await webpush.sendNotification(
                    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
                    message
                );
            } catch (error) {
                const status = Number((error as { statusCode?: number })?.statusCode || 0);
                // 404/410 mean the browser threw the subscription away — prune it, or the
                // list fills with endpoints that can never receive anything again.
                if (status === 404 || status === 410) {
                    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
                } else {
                    this.logger.warn(`push failed (${status}): ${(error as Error).message}`);
                }
            }
        }));
    }
}
