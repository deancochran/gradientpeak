import { RLSTestCase } from './types';
/**
 * Specialized RLS testing utilities
 */
export declare class RLSTestHelper {
    private supabase;
    private adminClient;
    constructor();
    /**
     * Test specific RLS policy with detailed error reporting
     */
    testPolicy(testCase: RLSTestCase): Promise<{
        passed: boolean;
        message: string;
        details?: any;
        executionTime: number;
    }>;
    /**
     * Run a comprehensive test suite for a table
     */
    testTablePolicies(tableName: string, ownUserId: string, otherUserId: string, sampleData?: any): Promise<{
        passed: boolean;
        totalTests: number;
        passedTests: number;
        failedTests: number;
        results: Array<{
            testCase: RLSTestCase;
            result: Awaited<ReturnType<RLSTestHelper['testPolicy']>>;
        }>;
    }>;
    /**
     * Verify RLS is enabled for a table
     */
    verifyRLSEnabled(tableName: string): Promise<boolean>;
    /**
     * Get all RLS policies for a table
     */
    getPolicies(tableName: string): Promise<any[]>;
    /**
     * Test anonymous access (should be denied)
     */
    testAnonymousAccess(tableName: string): Promise<{
        passed: boolean;
        operations: Record<string, boolean>;
    }>;
    /**
     * Clean up test data created during RLS testing
     */
    cleanup(tableName: string, testUserIds: string[]): Promise<void>;
}
export declare const rlsTestHelper: RLSTestHelper;
//# sourceMappingURL=rls.d.ts.map