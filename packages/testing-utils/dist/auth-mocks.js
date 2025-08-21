"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authAssertions = exports.authStateScenarios = void 0;
exports.createMockClerkUser = createMockClerkUser;
exports.createMockClerkSession = createMockClerkSession;
exports.createMockClerkAuth = createMockClerkAuth;
exports.createMockSupabaseUser = createMockSupabaseUser;
exports.createMockSupabaseSession = createMockSupabaseSession;
exports.createMockSupabaseAuth = createMockSupabaseAuth;
exports.validateMockToken = validateMockToken;
exports.createMockAuthMiddleware = createMockAuthMiddleware;
const inline_helpers_1 = require("./inline-helpers");
/**
 * Create a mock Clerk user object
 */
function createMockClerkUser(overrides = {}) {
    const userId = overrides.id || (0, inline_helpers_1.fakeUserId)();
    const email = (0, inline_helpers_1.fakeEmail)();
    const emailId = `idn_${userId.replace('user_', '')}`;
    return {
        id: userId,
        emailAddresses: [
            {
                id: emailId,
                emailAddress: email,
            },
        ],
        firstName: (0, inline_helpers_1.fakeFirstName)(),
        lastName: (0, inline_helpers_1.fakeLastName)(),
        primaryEmailAddressId: emailId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
/**
 * Create a mock Clerk session object
 */
function createMockClerkSession(userId, overrides = {}) {
    const now = new Date();
    const expireAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    const abandonAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    return {
        id: `sess_${userId.replace('user_', '')}`,
        userId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        expireAt,
        abandonAt,
        lastActiveAt: now,
        lastActiveOrganizationId: null,
        ...overrides,
    };
}
/**
 * Create a mock authenticated Clerk context
 */
function createMockClerkAuth(options = {}) {
    const { authenticated = true, user = {}, session = {}, loadingState = false } = options;
    if (!authenticated) {
        return {
            userId: null,
            sessionId: null,
            user: null,
            session: null,
            isLoaded: !loadingState,
            isSignedIn: false,
            getToken: async () => null,
            signOut: async () => { },
        };
    }
    const mockUser = createMockClerkUser(user);
    const mockSession = createMockClerkSession(mockUser.id, session);
    return {
        userId: mockUser.id,
        sessionId: mockSession.id,
        user: mockUser,
        session: mockSession,
        isLoaded: !loadingState,
        isSignedIn: true,
        getToken: async (options) => {
            const template = options?.template || 'default';
            // Return a fake JWT token with the user ID in the sub claim
            return (0, inline_helpers_1.fakeFakeJWTToken)({ sub: mockUser.id, template });
        },
        signOut: async () => {
            // Mock sign out - in real tests this would trigger state updates
        },
    };
}
/**
 * Create a mock Supabase auth user
 */
function createMockSupabaseUser(overrides = {}) {
    const userId = (0, inline_helpers_1.fakeUserId)();
    const email = (0, inline_helpers_1.fakeEmail)();
    const firstName = (0, inline_helpers_1.fakeFirstName)();
    const lastName = (0, inline_helpers_1.fakeLastName)();
    return {
        id: userId,
        email,
        user_metadata: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`,
        },
        app_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}
/**
 * Create a mock Supabase auth session
 */
function createMockSupabaseSession(user) {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    return {
        access_token: (0, inline_helpers_1.fakeFakeJWTToken)({ sub: user.id }),
        refresh_token: `refresh_${user.id.replace('user_', '')}`,
        expires_at: expiresAt,
        expires_in: 3600,
        token_type: 'bearer',
        user,
    };
}
/**
 * Create a mock authenticated Supabase context
 */
function createMockSupabaseAuth(options = {}) {
    const { authenticated = true, user = {} } = options;
    if (!authenticated) {
        return {
            user: null,
            session: null,
        };
    }
    const mockUser = createMockSupabaseUser(user);
    const mockSession = createMockSupabaseSession(mockUser);
    return {
        user: mockUser,
        session: mockSession,
    };
}
/**
 * Authentication state scenarios for comprehensive testing
 */
exports.authStateScenarios = {
    /**
     * Fully authenticated user with valid session
     */
    authenticated: () => ({
        clerk: createMockClerkAuth(),
        supabase: createMockSupabaseAuth(),
    }),
    /**
     * Unauthenticated user (logged out)
     */
    unauthenticated: () => ({
        clerk: createMockClerkAuth({ authenticated: false }),
        supabase: createMockSupabaseAuth({ authenticated: false }),
    }),
    /**
     * Loading state (auth system initializing)
     */
    loading: () => ({
        clerk: createMockClerkAuth({ loadingState: true }),
        supabase: createMockSupabaseAuth({ authenticated: false }), // Supabase doesn't have loading state
    }),
    /**
     * Expired session scenario
     */
    expiredSession: () => ({
        clerk: createMockClerkAuth({
            session: {
                status: 'expired',
                expireAt: new Date(Date.now() - 1000), // Expired 1 second ago
            },
        }),
        supabase: createMockSupabaseAuth({
            authenticated: false, // Would be null after session expires
        }),
    }),
    /**
     * User with incomplete profile
     */
    incompleteProfile: () => ({
        clerk: createMockClerkAuth({
            user: {
                firstName: null,
                lastName: null,
            },
        }),
        supabase: createMockSupabaseAuth({
            user: {
                user_metadata: {
                    first_name: undefined,
                    last_name: undefined,
                    full_name: undefined,
                },
            },
        }),
    }),
    /**
     * Admin user scenario
     */
    adminUser: () => ({
        clerk: createMockClerkAuth({
            user: {
                emailAddresses: [{
                        id: 'admin_email',
                        emailAddress: 'admin@turbofit.dev',
                    }],
            },
        }),
        supabase: createMockSupabaseAuth({
            user: {
                email: 'admin@turbofit.dev',
                app_metadata: {
                    role: 'admin',
                    permissions: ['read', 'write', 'admin'],
                },
            },
        }),
    }),
    /**
     * User with multiple email addresses
     */
    multipleEmails: () => {
        const primaryEmail = (0, inline_helpers_1.fakeEmail)();
        const secondaryEmail = (0, inline_helpers_1.fakeEmail)('secondary');
        return {
            clerk: createMockClerkAuth({
                user: {
                    emailAddresses: [
                        { id: 'primary_email', emailAddress: primaryEmail },
                        { id: 'secondary_email', emailAddress: secondaryEmail },
                    ],
                    primaryEmailAddressId: 'primary_email',
                },
            }),
            supabase: createMockSupabaseAuth({
                user: {
                    email: primaryEmail,
                    user_metadata: {
                        first_name: 'Multi',
                        last_name: 'Email',
                        full_name: 'Multi Email',
                    },
                },
            }),
        };
    },
};
/**
 * Mock authentication token validation
 */
function validateMockToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: 'Invalid token format' };
        }
        // Decode payload (this is a mock, so we don't validate signature)
        const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        // Check if token is expired
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return { valid: false, error: 'Token expired' };
        }
        return { valid: true, payload };
    }
    catch (error) {
        return { valid: false, error: `Token parsing failed: ${error}` };
    }
}
/**
 * Create mock authentication middleware for testing
 */
function createMockAuthMiddleware(defaultAuthState = 'authenticated') {
    const scenarios = exports.authStateScenarios;
    let currentState = scenarios[defaultAuthState]();
    return {
        /**
         * Get current authentication state
         */
        getAuthState: () => currentState,
        /**
         * Set authentication state for testing
         */
        setAuthState: (state, customState) => {
            if (state === 'custom' && customState) {
                currentState = customState;
            }
            else {
                currentState = scenarios[state]();
            }
        },
        /**
         * Mock authentication check
         */
        isAuthenticated: () => currentState.clerk.isSignedIn,
        /**
         * Mock user retrieval
         */
        getCurrentUser: () => currentState.clerk.user,
        /**
         * Mock token retrieval
         */
        getToken: async (template) => {
            return currentState.clerk.getToken({ template });
        },
        /**
         * Mock sign out
         */
        signOut: async () => {
            currentState = scenarios.unauthenticated();
        },
        /**
         * Reset to default state
         */
        reset: () => {
            currentState = scenarios[defaultAuthState]();
        },
    };
}
/**
 * Authentication test assertions
 */
exports.authAssertions = {
    /**
     * Assert that user is authenticated
     */
    assertAuthenticated: (authState) => {
        if ('isSignedIn' in authState) {
            // Clerk auth
            if (!authState.isSignedIn || !authState.user) {
                throw new Error('Expected user to be authenticated but found unauthenticated state');
            }
        }
        else {
            // Supabase auth
            if (!authState.user || !authState.session) {
                throw new Error('Expected user to be authenticated but found unauthenticated state');
            }
        }
    },
    /**
     * Assert that user is not authenticated
     */
    assertUnauthenticated: (authState) => {
        if ('isSignedIn' in authState) {
            // Clerk auth
            if (authState.isSignedIn || authState.user) {
                throw new Error('Expected user to be unauthenticated but found authenticated state');
            }
        }
        else {
            // Supabase auth
            if (authState.user || authState.session) {
                throw new Error('Expected user to be unauthenticated but found authenticated state');
            }
        }
    },
    /**
     * Assert that authentication is in loading state
     */
    assertLoading: (authState) => {
        if (authState.isLoaded) {
            throw new Error('Expected authentication to be in loading state but found loaded state');
        }
    },
    /**
     * Assert that user has specific email
     */
    assertUserEmail: (authState, expectedEmail) => {
        let actualEmail;
        if ('isSignedIn' in authState) {
            // Clerk auth
            actualEmail = authState.user?.emailAddresses[0]?.emailAddress;
        }
        else {
            // Supabase auth
            actualEmail = authState.user?.email;
        }
        if (actualEmail !== expectedEmail) {
            throw new Error(`Expected user email to be "${expectedEmail}" but got "${actualEmail}"`);
        }
    },
};
