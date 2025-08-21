"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseTestHelper = exports.DatabaseTestHelper = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("./config");
class DatabaseTestHelper {
    supabase;
    adminClient;
    constructor() {
        // Regular client with anon key
        this.supabase = (0, supabase_js_1.createClient)(config_1.testConfig.supabase.url, config_1.testConfig.supabase.anonKey);
        // Admin client with service role key for cleanup
        this.adminClient = (0, supabase_js_1.createClient)(config_1.testConfig.supabase.url, config_1.testConfig.supabase.serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    /**
     * Set authentication context for testing RLS
     */
    setAuthContext(jwtToken) {
        // Note: Using session instead of deprecated setAuth
        this.supabase.auth.setSession({
            access_token: jwtToken,
            refresh_token: '',
            user: null
        });
    }
    /**
     * Clear authentication context
     */
    clearAuthContext() {
        this.supabase.auth.signOut();
    }
    /**
     * Create test user in Supabase
     */
    async createSupabaseUser(user) {
        const { data, error } = await this.adminClient
            .from('users')
            .insert({
            clerk_user_id: user.clerkUserId,
            email: user.email,
            first_name: user.firstName,
            last_name: user.lastName,
        })
            .select('id')
            .single();
        if (error) {
            throw new Error(`Failed to create Supabase user: ${error.message}`);
        }
        return data.id;
    }
    /**
     * Create test activity
     */
    async createTestActivity(activity) {
        const { data, error } = await this.supabase
            .from('activities')
            .insert({
            user_id: activity.userId,
            name: activity.name,
            activity_type: activity.type,
            start_time: activity.startTime.toISOString(),
            end_time: activity.endTime.toISOString(),
            duration_seconds: activity.duration,
            distance_meters: activity.distance,
            calories_burned: activity.calories,
            elevation_gain_meters: activity.elevationGain,
        })
            .select('id')
            .single();
        if (error) {
            throw new Error(`Failed to create test activity: ${error.message}`);
        }
        return data.id;
    }
    /**
     * Test RLS policies
     */
    async testRLSPolicy(testCase) {
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
            const hasError = result.error !== null;
            const shouldHaveSucceeded = testCase.shouldSucceed;
            if (hasError && shouldHaveSucceeded) {
                return {
                    success: false,
                    error: `Expected success but got error: ${result.error?.message || 'Unknown error'}`
                };
            }
            if (!hasError && !shouldHaveSucceeded) {
                return {
                    success: false,
                    error: 'Expected failure but operation succeeded'
                };
            }
            return { success: true };
        }
        catch (error) {
            if (testCase.shouldSucceed) {
                return {
                    success: false,
                    error: `Unexpected error: ${error}`
                };
            }
            return { success: true }; // Expected failure
        }
    }
    /**
     * Clean up test data
     */
    async cleanup() {
        if (!config_1.testConfig.database.cleanupBetweenTests) {
            return;
        }
        try {
            // Clean up in reverse dependency order
            const tables = [
                'activity_analytics',
                'user_achievements',
                'user_metrics',
                'activity_segments',
                'activities',
                'users',
            ];
            for (const table of tables) {
                await this.adminClient
                    .from(table)
                    .delete()
                    .like('email', '%@test.example%'); // Only delete test users
            }
        }
        catch (error) {
            console.warn('Failed to cleanup test data:', error);
        }
    }
    /**
     * Verify user sync between Clerk and Supabase
     */
    async verifyUserSync(clerkUserId, email) {
        const { data, error } = await this.adminClient
            .from('users')
            .select('*')
            .eq('clerk_user_id', clerkUserId)
            .eq('email', email)
            .single();
        return !error && data !== null;
    }
    /**
     * Generate RLS test cases
     */
    generateRLSTestCases(userId, otherUserId) {
        return [
            // Users table tests
            {
                tableName: 'users',
                userId,
                operation: 'select',
                shouldSucceed: true,
                description: 'User can read their own profile',
            },
            {
                tableName: 'users',
                userId: otherUserId,
                operation: 'select',
                shouldSucceed: false,
                description: 'User cannot read other profiles',
            },
            // Activities table tests
            {
                tableName: 'activities',
                userId,
                operation: 'select',
                shouldSucceed: true,
                description: 'User can read their own activities',
            },
            {
                tableName: 'activities',
                userId,
                operation: 'insert',
                data: {
                    name: 'Test Activity',
                    activity_type: 'running',
                    start_time: new Date().toISOString(),
                    end_time: new Date().toISOString(),
                    duration_seconds: 3600,
                },
                shouldSucceed: true,
                description: 'User can create their own activities',
            },
            {
                tableName: 'activities',
                userId: otherUserId,
                operation: 'select',
                shouldSucceed: false,
                description: 'User cannot read other users activities',
            },
            // User metrics tests
            {
                tableName: 'user_metrics',
                userId,
                operation: 'select',
                shouldSucceed: true,
                description: 'User can read their own metrics',
            },
            {
                tableName: 'user_metrics',
                userId: otherUserId,
                operation: 'select',
                shouldSucceed: false,
                description: 'User cannot read other users metrics',
            },
        ];
    }
}
exports.DatabaseTestHelper = DatabaseTestHelper;
// Export singleton instance
exports.databaseTestHelper = new DatabaseTestHelper();
