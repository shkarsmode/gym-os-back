export declare class HealthController {
    health(): {
        ok: boolean;
        service: string;
        databaseConfigured: boolean;
        googleOAuthConfigured: boolean;
        timestamp: string;
    };
}
