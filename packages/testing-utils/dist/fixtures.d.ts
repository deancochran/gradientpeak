export declare const generateTestUser: (overrides?: {}) => {
    id: `${string}-${string}-${string}-${string}-${string}`;
    clerk_user_id: string;
    email: string;
    full_name: string;
    created_at: string;
};
export declare const generateTestActivity: (overrides?: {}) => {
    id: `${string}-${string}-${string}-${string}-${string}`;
    user_id: `${string}-${string}-${string}-${string}-${string}`;
    client_id: `${string}-${string}-${string}-${string}-${string}`;
    name: string;
    sport: string;
    status: string;
    privacy: string;
    distance_meters: number;
    duration_seconds: number;
    started_at: string;
    recorded_at: string;
    created_at: string;
    sync_status: string;
};
export declare const generateWebhookPayload: (type?: string, overrides?: {}) => {
    type: string;
    data: {
        id: string;
        email_addresses: {
            email_address: string;
            id: string;
        }[];
        first_name: string;
        last_name: string;
    };
};
//# sourceMappingURL=fixtures.d.ts.map