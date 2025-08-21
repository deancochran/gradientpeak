export declare const fakeEmail: () => string;
export declare const fakePassword: () => string;
export declare const fakeUserId: () => string;
export declare const fakeClerkId: () => string;
export declare const createTestWebhookPayload: (overrides?: {}) => {
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
export declare const checkTestEnvironment: () => boolean;
//# sourceMappingURL=helpers.d.ts.map