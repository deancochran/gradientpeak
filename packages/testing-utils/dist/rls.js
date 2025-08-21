"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rlsTestHelper = exports.RLSTestHelper = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("./config");
/**
 * Specialized RLS testing utilities
 */
class RLSTestHelper {
    supabase;
    adminClient;
    constructor() {
        this.supabase = (0, supabase_js_1.createClient)(config_1.testConfig.supabase.url, config_1.testConfig.supabase.anonKey);
        this.adminClient = (0, supabase_js_1.createClient)(config_1.testConfig.supabase.url, config_1.testConfig.supabase.serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    /**
     * Test specific RLS policy with detailed error reporting
     */
    async testPolicy(testCase) {
        const startTime = Date.now();
        try {
            let result;
            switch (testCase.operation) {
                case 'select':
                    result = await this.supabase
                        .from(testCase.tableName)
                        .select('*')
                        .eq('user_id', testCase.userId);
                    break;
                case 'insert':
                    result = await this.supabase
                        .from(testCase.tableName)
                        .insert({ ...testCase.data, user_id: testCase.userId });
                    break;
                case 'update':
                    result = await this.supabase
                        .from(testCase.tableName)
                        .update(testCase.data)
                        .eq('user_id', testCase.userId);
                    break;
                case 'delete':
                    result = await this.supabase
                        .from(testCase.tableName)
                        .delete()
                        .eq('user_id', testCase.userId);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${testCase.operation}`);
            }
            const executionTime = Date.now() - startTime;
            const hasError = result.error !== null;
            if (testCase.shouldSucceed && hasError) {
                return {
                    passed: false,
                    message: `Expected success but got error: ${result.error?.message || 'Unknown error'}`,
                    details: {
                        error: result.error,
                        testCase,
                        expectedSuccess: true,
                        actualSuccess: false,
                    },
                    executionTime,
                };
            }
            if (!testCase.shouldSucceed && !hasError) {
                return {
                    passed: false,
                    message: 'Expected failure but operation succeeded',
                    details: {
                        data: result.data,
                        testCase,
                        expectedSuccess: false,
                        actualSuccess: true,
                    },
                    executionTime,
                };
            }
            return {
                passed: true,
                message: testCase.shouldSucceed
                    ? 'Operation succeeded as expected'
                    : 'Operation failed as expected',
                details: {
                    data: result.data,
                    error: result.error,
                    testCase,
                },
                executionTime,
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            if (testCase.shouldSucceed) {
                return {
                    passed: false,
                    message: `Unexpected error: ${error}`,
                    details: { error, testCase },
                    executionTime,
                };
            }
            return {
                passed: true,
                message: 'Operation failed as expected (exception thrown)',
                details: { error, testCase },
                executionTime,
            };
        }
    }
    /**
     * Run a comprehensive test suite for a table
     */
    async testTablePolicies(tableName, ownUserId, otherUserId, sampleData = {}) {
        const testCases = [
            // Select own data
            {
                tableName,
                userId: ownUserId,
                operation: 'select',
                shouldSucceed: true,
                description: `User can select from own ${tableName}`,
            },
            // Select other user's data
            {
                tableName,
                userId: otherUserId,
                operation: 'select',
                shouldSucceed: false,
                description: `User cannot select from other user's ${tableName}`,
            },
            // Insert own data
            {
                tableName,
                userId: ownUserId,
                operation: 'insert',
                data: sampleData,
                shouldSucceed: true,
                description: `User can insert into own ${tableName}`,
            },
            // Insert for other user
            {
                tableName,
                userId: otherUserId,
                operation: 'insert',
                data: sampleData,
                shouldSucceed: false,
                description: `User cannot insert into other user's ${tableName}`,
            },
            // Update own data
            {
                tableName,
                userId: ownUserId,
                operation: 'update',
                data: { updated_at: new Date().toISOString() },
                shouldSucceed: true,
                description: `User can update own ${tableName}`,
            },
            // Update other user's data
            {
                tableName,
                userId: otherUserId,
                operation: 'update',
                data: { updated_at: new Date().toISOString() },
                shouldSucceed: false,
                description: `User cannot update other user's ${tableName}`,
            },
            // Delete own data
            {
                tableName,
                userId: ownUserId,
                operation: 'delete',
                shouldSucceed: true,
                description: `User can delete own ${tableName}`,
            },
            // Delete other user's data
            {
                tableName,
                userId: otherUserId,
                operation: 'delete',
                shouldSucceed: false,
                description: `User cannot delete other user's ${tableName}`,
            },
        ];
        const results = [];
        let passedTests = 0;
        for (const testCase of testCases) {
            const result = await this.testPolicy(testCase);
            results.push({ testCase, result });
            if (result.passed) {
                passedTests++;
            }
        }
        return {
            passed: passedTests === testCases.length,
            totalTests: testCases.length,
            passedTests,
            failedTests: testCases.length - passedTests,
            results,
        };
    }
    /**
     * Verify RLS is enabled for a table
     */
    async verifyRLSEnabled(tableName) {
        try {
            const { data, error } = await this.adminClient
                .from('information_schema.tables')
                .select('*')
                .eq('table_name', tableName)
                .eq('table_schema', 'public');
            if (error) {
                throw error;
            }
            // Check if RLS is enabled (this query might need adjustment based on Supabase setup)
            const { data: rlsData, error: rlsError } = await this.adminClient
                .rpc('check_rls_enabled', { table_name: tableName });
            return !rlsError && rlsData === true;
        }
        catch (error) {
            console.warn(`Could not verify RLS status for ${tableName}:`, error);
            return false;
        }
    }
    /**
     * Get all RLS policies for a table
     */
    async getPolicies(tableName) {
        try {
            const { data, error } = await this.adminClient
                .from('pg_policies')
                .select('*')
                .eq('tablename', tableName);
            if (error) {
                throw error;
            }
            return data || [];
        }
        catch (error) {
            console.warn(`Could not get policies for ${tableName}:`, error);
            return [];
        }
    }
    /**
     * Test anonymous access (should be denied)
     */
    async testAnonymousAccess(tableName) {
        // Clear any auth
        this.supabase.auth.signOut();
        const operations = {
            select: false,
            insert: false,
            update: false,
            delete: false,
        };
        // Test select
        try {
            const { error } = await this.supabase
                .from(tableName)
                .select('*')
                .limit(1);
            operations.select = error === null;
        }
        catch {
            operations.select = false;
        }
        // Test insert
        try {
            const { error } = await this.supabase
                .from(tableName)
                .insert({ test: 'data' });
            operations.insert = error === null;
        }
        catch {
            operations.insert = false;
        }
        // Test update
        try {
            const { error } = await this.supabase
                .from(tableName)
                .update({ test: 'data' })
                .eq('id', 'test');
            operations.update = error === null;
        }
        catch {
            operations.update = false;
        }
        // Test delete
        try {
            const { error } = await this.supabase
                .from(tableName)
                .delete()
                .eq('id', 'test');
            operations.delete = error === null;
        }
        catch {
            operations.delete = false;
        }
        // All operations should have failed (returned false)
        const passed = !Object.values(operations).some(succeeded => succeeded);
        return { passed, operations };
    }
    /**
     * Clean up test data created during RLS testing
     */
    async cleanup(tableName, testUserIds) {
        try {
            for (const userId of testUserIds) {
                await this.adminClient
                    .from(tableName)
                    .delete()
                    .eq('user_id', userId);
            }
        }
        catch (error) {
            console.warn(`Failed to cleanup ${tableName} for RLS testing:`, error);
        }
    }
}
exports.RLSTestHelper = RLSTestHelper;
// Export singleton instance
exports.rlsTestHelper = new RLSTestHelper();
