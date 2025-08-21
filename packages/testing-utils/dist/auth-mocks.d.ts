/**
 * Authentication state mocking utilities for testing
 * These utilities provide realistic mock authentication states
 * for both Clerk and Supabase authentication systems.
 */
/**
 * Mock user object structure matching Clerk's user format
 */
export interface MockUser {
    id: string;
    emailAddresses: Array<{
        id: string;
        emailAddress: string;
    }>;
    firstName: string | null;
    lastName: string | null;
    primaryEmailAddressId: string | null;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Mock session object structure matching Clerk's session format
 */
export interface MockSession {
    id: string;
    userId: string;
    status: 'active' | 'expired' | 'ended' | 'removed' | 'replaced' | 'revoked';
    createdAt: Date;
    updatedAt: Date;
    expireAt: Date;
    abandonAt: Date;
    lastActiveAt: Date;
    lastActiveOrganizationId: string | null;
}
/**
 * Mock authentication context for Clerk
 */
export interface MockClerkAuth {
    userId: string | null;
    sessionId: string | null;
    user: MockUser | null;
    session: MockSession | null;
    isLoaded: boolean;
    isSignedIn: boolean;
    getToken: (options?: {
        template?: string;
    }) => Promise<string | null>;
    signOut: () => Promise<void>;
}
/**
 * Mock authentication context for Supabase
 */
export interface MockSupabaseAuth {
    user: {
        id: string;
        email: string;
        user_metadata: {
            first_name?: string;
            last_name?: string;
            full_name?: string;
        };
        app_metadata: Record<string, any>;
        created_at: string;
        updated_at: string;
    } | null;
    session: {
        access_token: string;
        refresh_token: string;
        expires_at?: number;
        expires_in?: number;
        token_type: string;
        user: any;
    } | null;
}
/**
 * Create a mock Clerk user object
 */
export declare function createMockClerkUser(overrides?: Partial<MockUser>): MockUser;
/**
 * Create a mock Clerk session object
 */
export declare function createMockClerkSession(userId: string, overrides?: Partial<MockSession>): MockSession;
/**
 * Create a mock authenticated Clerk context
 */
export declare function createMockClerkAuth(options?: {
    authenticated?: boolean;
    user?: Partial<MockUser>;
    session?: Partial<MockSession>;
    loadingState?: boolean;
}): MockClerkAuth;
/**
 * Create a mock Supabase auth user
 */
export declare function createMockSupabaseUser(overrides?: Partial<MockSupabaseAuth['user']>): MockSupabaseAuth['user'];
/**
 * Create a mock Supabase auth session
 */
export declare function createMockSupabaseSession(user: NonNullable<MockSupabaseAuth['user']>): MockSupabaseAuth['session'];
/**
 * Create a mock authenticated Supabase context
 */
export declare function createMockSupabaseAuth(options?: {
    authenticated?: boolean;
    user?: Partial<MockSupabaseAuth['user']>;
}): MockSupabaseAuth;
/**
 * Authentication state scenarios for comprehensive testing
 */
export declare const authStateScenarios: {
    /**
     * Fully authenticated user with valid session
     */
    authenticated: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * Unauthenticated user (logged out)
     */
    unauthenticated: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * Loading state (auth system initializing)
     */
    loading: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * Expired session scenario
     */
    expiredSession: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * User with incomplete profile
     */
    incompleteProfile: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * Admin user scenario
     */
    adminUser: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * User with multiple email addresses
     */
    multipleEmails: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
};
/**
 * Mock authentication token validation
 */
export declare function validateMockToken(token: string): {
    valid: boolean;
    payload?: any;
    error?: string;
};
/**
 * Create mock authentication middleware for testing
 */
export declare function createMockAuthMiddleware(defaultAuthState?: 'authenticated' | 'unauthenticated' | 'loading'): {
    /**
     * Get current authentication state
     */
    getAuthState: () => {
        clerk: MockClerkAuth;
        supabase: MockSupabaseAuth;
    };
    /**
     * Set authentication state for testing
     */
    setAuthState: (state: ("authenticated" | "unauthenticated" | "loading" | "expiredSession" | "incompleteProfile" | "adminUser" | "multipleEmails") | "custom", customState?: any) => void;
    /**
     * Mock authentication check
     */
    isAuthenticated: () => boolean;
    /**
     * Mock user retrieval
     */
    getCurrentUser: () => MockUser | null;
    /**
     * Mock token retrieval
     */
    getToken: (template?: string) => Promise<string | null>;
    /**
     * Mock sign out
     */
    signOut: () => Promise<void>;
    /**
     * Reset to default state
     */
    reset: () => void;
};
/**
 * Authentication test assertions
 */
export declare const authAssertions: {
    /**
     * Assert that user is authenticated
     */
    assertAuthenticated: (authState: MockClerkAuth | MockSupabaseAuth) => void;
    /**
     * Assert that user is not authenticated
     */
    assertUnauthenticated: (authState: MockClerkAuth | MockSupabaseAuth) => void;
    /**
     * Assert that authentication is in loading state
     */
    assertLoading: (authState: MockClerkAuth) => void;
    /**
     * Assert that user has specific email
     */
    assertUserEmail: (authState: MockClerkAuth | MockSupabaseAuth, expectedEmail: string) => void;
};
//# sourceMappingURL=auth-mocks.d.ts.map