import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

export interface ClientRecord {
    id: string;
    secretHash: string | null;
    name: string;
    redirectUris: string[];
    authMethod: string;
    createdAt: Date;
    lastUsedAt: Date | null;
}

export interface AuthRequestRecord {
    id: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    resource: string;
    state: string | null;
    bindingHash: string;
    csrfHash: string | null;
    userId: string | null;
    email: string | null;
    grantedScope: string | null;
    codeHash: string | null;
    codeExpiresAt: Date | null;
    consumedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
}

export interface TokenRecord {
    id: string;
    kind: "access" | "refresh";
    tokenHash: string;
    clientId: string;
    userId: string;
    email: string;
    scope: string;
    resource: string;
    familyId: string;
    requestId: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    rotatedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
}

export abstract class OAuthStore {
    abstract createClient(client: ClientRecord): Promise<void>;
    abstract upsertClient(client: ClientRecord): Promise<void>;
    abstract findClient(id: string): Promise<ClientRecord | null>;
    abstract touchClient(id: string, at: Date): Promise<void>;
    abstract countClients(): Promise<number>;
    abstract deleteUnusedClients(createdBefore: Date): Promise<number>;
    abstract createRequest(request: AuthRequestRecord): Promise<void>;
    abstract findRequest(id: string): Promise<AuthRequestRecord | null>;
    abstract findRequestByCode(codeHash: string): Promise<AuthRequestRecord | null>;
    abstract updateRequest(id: string, patch: Partial<AuthRequestRecord>): Promise<void>;
    abstract consumeRequest(id: string, at: Date): Promise<boolean>;
    abstract deleteExpiredRequests(before: Date): Promise<number>;
    abstract createTokens(tokens: TokenRecord[]): Promise<void>;
    abstract findToken(tokenHash: string): Promise<TokenRecord | null>;
    abstract markRotated(id: string, at: Date): Promise<boolean>;
    abstract touchToken(id: string, at: Date): Promise<void>;
    abstract revokeToken(id: string, at: Date): Promise<void>;
    abstract revokeFamily(familyId: string, at: Date): Promise<number>;
    abstract revokeByRequest(requestId: string, at: Date): Promise<number>;
    abstract revokeAllForUser(userId: string, at: Date): Promise<number>;
}

function toClient(row: any): ClientRecord {
    return {
        ...row,
        redirectUris: Array.isArray(row.redirectUris) ? row.redirectUris.map(String) : []
    };
}

@Injectable()
export class PrismaOAuthStore extends OAuthStore {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async createClient(client: ClientRecord) {
        await this.prisma.mcpClient.create({ data: { ...client, redirectUris: client.redirectUris } });
    }

    async upsertClient(client: ClientRecord) {
        const { id, ...rest } = client;
        await this.prisma.mcpClient.upsert({
            where: { id },
            create: { ...client, redirectUris: client.redirectUris },
            update: { secretHash: rest.secretHash, name: rest.name, redirectUris: rest.redirectUris, authMethod: rest.authMethod }
        });
    }

    async findClient(id: string) {
        const row = await this.prisma.mcpClient.findUnique({ where: { id } });
        return row ? toClient(row) : null;
    }

    async touchClient(id: string, at: Date) {
        await this.prisma.mcpClient.updateMany({ where: { id }, data: { lastUsedAt: at } });
    }

    countClients() {
        return this.prisma.mcpClient.count();
    }

    async deleteUnusedClients(createdBefore: Date) {
        const result = await this.prisma.mcpClient.deleteMany({ where: { lastUsedAt: null, createdAt: { lt: createdBefore } } });
        return result.count;
    }

    async createRequest(request: AuthRequestRecord) {
        await this.prisma.mcpAuthRequest.create({ data: request });
    }

    findRequest(id: string) {
        return this.prisma.mcpAuthRequest.findUnique({ where: { id } });
    }

    findRequestByCode(codeHash: string) {
        return this.prisma.mcpAuthRequest.findUnique({ where: { codeHash } });
    }

    async updateRequest(id: string, patch: Partial<AuthRequestRecord>) {
        await this.prisma.mcpAuthRequest.updateMany({ where: { id }, data: patch });
    }

    async consumeRequest(id: string, at: Date) {
        const result = await this.prisma.mcpAuthRequest.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: at } });
        return result.count === 1;
    }

    async deleteExpiredRequests(before: Date) {
        const result = await this.prisma.mcpAuthRequest.deleteMany({ where: { expiresAt: { lt: before } } });
        return result.count;
    }

    async createTokens(tokens: TokenRecord[]) {
        await this.prisma.mcpToken.createMany({ data: tokens });
    }

    async findToken(tokenHash: string) {
        const row = await this.prisma.mcpToken.findUnique({ where: { tokenHash } });
        return row as TokenRecord | null;
    }

    async markRotated(id: string, at: Date) {
        const result = await this.prisma.mcpToken.updateMany({ where: { id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: at } });
        return result.count === 1;
    }

    async touchToken(id: string, at: Date) {
        await this.prisma.mcpToken.updateMany({ where: { id }, data: { lastUsedAt: at } });
    }

    async revokeToken(id: string, at: Date) {
        await this.prisma.mcpToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
    }

    async revokeFamily(familyId: string, at: Date) {
        const result = await this.prisma.mcpToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
        return result.count;
    }

    async revokeByRequest(requestId: string, at: Date) {
        const families = await this.prisma.mcpToken.findMany({ where: { requestId }, select: { familyId: true }, distinct: ["familyId"] });
        if (!families.length) {
            return 0;
        }
        const result = await this.prisma.mcpToken.updateMany({
            where: { familyId: { in: families.map((row) => row.familyId) }, revokedAt: null },
            data: { revokedAt: at }
        });
        return result.count;
    }

    async revokeAllForUser(userId: string, at: Date) {
        const result = await this.prisma.mcpToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } });
        return result.count;
    }
}

export class MemoryOAuthStore extends OAuthStore {
    readonly clients = new Map<string, ClientRecord>();
    readonly requests = new Map<string, AuthRequestRecord>();
    readonly tokens = new Map<string, TokenRecord>();

    async createClient(client: ClientRecord) {
        this.clients.set(client.id, { ...client });
    }

    async upsertClient(client: ClientRecord) {
        const existing = this.clients.get(client.id);
        this.clients.set(client.id, existing ? { ...existing, ...client, createdAt: existing.createdAt, lastUsedAt: existing.lastUsedAt } : { ...client });
    }

    async findClient(id: string) {
        const client = this.clients.get(id);
        return client ? { ...client } : null;
    }

    async touchClient(id: string, at: Date) {
        const client = this.clients.get(id);
        if (client) {
            client.lastUsedAt = at;
        }
    }

    async countClients() {
        return this.clients.size;
    }

    async deleteUnusedClients(createdBefore: Date) {
        let count = 0;
        for (const [id, client] of this.clients) {
            if (!client.lastUsedAt && client.createdAt < createdBefore) {
                this.clients.delete(id);
                count += 1;
            }
        }
        return count;
    }

    async createRequest(request: AuthRequestRecord) {
        this.requests.set(request.id, { ...request });
    }

    async findRequest(id: string) {
        const request = this.requests.get(id);
        return request ? { ...request } : null;
    }

    async findRequestByCode(codeHash: string) {
        const request = [...this.requests.values()].find((row) => row.codeHash === codeHash);
        return request ? { ...request } : null;
    }

    async updateRequest(id: string, patch: Partial<AuthRequestRecord>) {
        const request = this.requests.get(id);
        if (request) {
            Object.assign(request, patch);
        }
    }

    async consumeRequest(id: string, at: Date) {
        const request = this.requests.get(id);
        if (!request || request.consumedAt) {
            return false;
        }
        request.consumedAt = at;
        return true;
    }

    async deleteExpiredRequests(before: Date) {
        let count = 0;
        for (const [id, request] of this.requests) {
            if (request.expiresAt < before) {
                this.requests.delete(id);
                count += 1;
            }
        }
        return count;
    }

    async createTokens(tokens: TokenRecord[]) {
        for (const token of tokens) {
            this.tokens.set(token.id, { ...token });
        }
    }

    async findToken(tokenHash: string) {
        const token = [...this.tokens.values()].find((row) => row.tokenHash === tokenHash);
        return token ? { ...token } : null;
    }

    async markRotated(id: string, at: Date) {
        const token = this.tokens.get(id);
        if (!token || token.rotatedAt || token.revokedAt) {
            return false;
        }
        token.rotatedAt = at;
        return true;
    }

    async touchToken(id: string, at: Date) {
        const token = this.tokens.get(id);
        if (token) {
            token.lastUsedAt = at;
        }
    }

    async revokeToken(id: string, at: Date) {
        const token = this.tokens.get(id);
        if (token && !token.revokedAt) {
            token.revokedAt = at;
        }
    }

    private revokeWhere(match: (token: TokenRecord) => boolean, at: Date) {
        let count = 0;
        for (const token of this.tokens.values()) {
            if (!token.revokedAt && match(token)) {
                token.revokedAt = at;
                count += 1;
            }
        }
        return count;
    }

    async revokeFamily(familyId: string, at: Date) {
        return this.revokeWhere((token) => token.familyId === familyId, at);
    }

    async revokeByRequest(requestId: string, at: Date) {
        const families = new Set([...this.tokens.values()].filter((token) => token.requestId === requestId).map((token) => token.familyId));
        return this.revokeWhere((token) => families.has(token.familyId), at);
    }

    async revokeAllForUser(userId: string, at: Date) {
        return this.revokeWhere((token) => token.userId === userId, at);
    }
}
