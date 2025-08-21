import { TestUser, TestActivity, RLSTestCase } from './types';
export declare class DatabaseTestHelper {
    private supabase;
    private adminClient;
    constructor();
    /**
     * Set authentication context for testing RLS
     */
    setAuthContext(jwtToken: string): void;
    /**
     * Clear authentication context
     */
    clearAuthContext(): void;
    /**
     * Create test user in Supabase
     */
    createSupabaseUser(user: TestUser): Promise<string>;
    /**
     * Create test activity
     */
    createTestActivity(activity: TestActivity): Promise<string>;
    /**
     * Test RLS policies
     */
    testRLSPolicy(testCase: RLSTestCase): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Clean up test data
     */
    cleanup(): Promise<void>;
    /**
     * Verify user sync between Clerk and Supabase
     */
    verifyUserSync(clerkUserId: string, email: string): Promise<boolean>;
    /**
     * Generate RLS test cases
     */
    generateRLSTestCases(userId: string, otherUserId: string): RLSTestCase[];
}
export declare const databaseTestHelper: DatabaseTestHelper;
//# sourceMappingURL=database.d.ts.map