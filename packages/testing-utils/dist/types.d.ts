export interface TestUser {
    id: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    clerkUserId?: string;
    supabaseUserId?: string;
}
export interface TestActivity {
    id?: string;
    userId: string;
    name: string;
    type: 'running' | 'cycling' | 'swimming' | 'walking' | 'other';
    startTime: Date;
    endTime: Date;
    duration: number;
    distance?: number;
    calories?: number;
    elevationGain?: number;
}
export interface TestConfig {
    supabase: {
        url: string;
        serviceRoleKey: string;
        anonKey: string;
    };
    clerk: {
        publishableKey: string;
        secretKey: string;
        webhookSecret: string;
    };
    database: {
        testSchema?: string;
        cleanupBetweenTests: boolean;
    };
}
export interface AuthFlowTest {
    email: string;
    password: string;
    expectedRedirect?: string;
    shouldSucceed: boolean;
}
export interface WebhookTestPayload {
    type: 'user.created' | 'user.updated' | 'user.deleted';
    data: {
        id: string;
        email_addresses: Array<{
            email_address: string;
        }>;
        first_name?: string;
        last_name?: string;
    };
}
export interface RLSTestCase {
    tableName: string;
    userId: string;
    operation: 'select' | 'insert' | 'update' | 'delete';
    data?: Record<string, any>;
    shouldSucceed: boolean;
    description: string;
}
//# sourceMappingURL=types.d.ts.map