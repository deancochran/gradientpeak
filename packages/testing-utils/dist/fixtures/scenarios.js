"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAuthScenarioData = exports.getAuthScenarioByName = exports.getScenarioByName = exports.allTestScenarios = exports.pageObjectAuthScenarios = exports.crossPlatformAuthScenarios = exports.deviceAgnosticAuthScenarios = exports.achievementSystemScenario = exports.mobileAppScenario = exports.errorHandlingScenario = exports.performanceScenario = exports.dataSyncScenario = exports.multiUserPrivacyScenario = exports.activeUserScenario = exports.newUserOnboardingScenario = void 0;
const fixtures_1 = require("../fixtures");
/**
 * New user onboarding scenario
 */
const newUserOnboardingScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'new-user-onboarding@test.example',
        firstName: 'New',
        lastName: 'User',
    });
    return {
        name: 'New User Onboarding',
        description: 'Test the complete new user registration and onboarding flow',
        users: [user],
        activities: [],
        expectedOutcomes: {
            userCreatedInClerk: true,
            userSyncedToSupabase: true,
            welcomeEmailSent: true,
            dashboardAccessible: true,
            initialMetricsCreated: true,
        },
    };
};
exports.newUserOnboardingScenario = newUserOnboardingScenario;
/**
 * Active user with multiple activities scenario
 */
const activeUserScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'active-user@test.example',
        firstName: 'Active',
        lastName: 'User',
    });
    const activities = [
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'Morning Run',
            type: 'running',
            duration: 1800, // 30 minutes
            distance: 5000, // 5km
            calories: 350,
        }),
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'Evening Bike Ride',
            type: 'cycling',
            duration: 3600, // 60 minutes
            distance: 20000, // 20km
            calories: 600,
        }),
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'Swimming Session',
            type: 'swimming',
            duration: 2400, // 40 minutes
            distance: 2000, // 2km
            calories: 400,
        }),
    ];
    return {
        name: 'Active User with Multiple Activities',
        description: 'Test user with various types of activities and metrics calculation',
        users: [user],
        activities,
        expectedOutcomes: {
            totalActivities: 3,
            totalDistance: 27000,
            totalDuration: 7800,
            totalCalories: 1350,
            metricsCalculated: true,
            achievementsUnlocked: ['First 5K', '30 Minute Workout'],
        },
    };
};
exports.activeUserScenario = activeUserScenario;
/**
 * Multi-user privacy scenario
 */
const multiUserPrivacyScenario = () => {
    const user1 = (0, fixtures_1.generateTestUser)({
        email: 'privacy-user-1@test.example',
        firstName: 'Privacy',
        lastName: 'User1',
    });
    const user2 = (0, fixtures_1.generateTestUser)({
        email: 'privacy-user-2@test.example',
        firstName: 'Privacy',
        lastName: 'User2',
    });
    const user1Activities = [
        (0, fixtures_1.generateTestActivity)(user1.id, { name: 'User1 Private Run' }),
        (0, fixtures_1.generateTestActivity)(user1.id, { name: 'User1 Private Swim' }),
    ];
    const user2Activities = [
        (0, fixtures_1.generateTestActivity)(user2.id, { name: 'User2 Private Cycle' }),
        (0, fixtures_1.generateTestActivity)(user2.id, { name: 'User2 Private Walk' }),
    ];
    return {
        name: 'Multi-User Privacy',
        description: 'Test that users can only access their own data',
        users: [user1, user2],
        activities: [...user1Activities, ...user2Activities],
        expectedOutcomes: {
            user1CanAccessOwnData: true,
            user1CannotAccessUser2Data: true,
            user2CanAccessOwnData: true,
            user2CannotAccessUser1Data: true,
            rlsPoliciesEnforced: true,
        },
    };
};
exports.multiUserPrivacyScenario = multiUserPrivacyScenario;
/**
 * Data synchronization scenario
 */
const dataSyncScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'sync-user@test.example',
        firstName: 'Sync',
        lastName: 'User',
    });
    const activities = [
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'Online Activity',
            type: 'running',
        }),
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'Offline Activity',
            type: 'walking',
        }),
    ];
    return {
        name: 'Data Synchronization',
        description: 'Test offline data creation and subsequent synchronization',
        users: [user],
        activities,
        expectedOutcomes: {
            onlineActivitySynced: true,
            offlineActivityStored: true,
            offlineActivitySyncedWhenOnline: true,
            noDataLoss: true,
            conflictResolution: 'handled',
        },
    };
};
exports.dataSyncScenario = dataSyncScenario;
/**
 * Performance and load testing scenario
 */
const performanceScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'performance-user@test.example',
        firstName: 'Performance',
        lastName: 'User',
    });
    // Generate many activities for performance testing
    const activities = Array.from({ length: 100 }, (_, index) => (0, fixtures_1.generateTestActivity)(user.id, {
        name: `Performance Activity ${index + 1}`,
        type: ['running', 'cycling', 'swimming', 'walking'][index % 4],
    }));
    return {
        name: 'Performance Testing',
        description: 'Test system performance with large amounts of data',
        users: [user],
        activities,
        expectedOutcomes: {
            allActivitiesCreated: true,
            dashboardLoadsQuickly: true, // < 2 seconds
            metricsCalculatedEfficiently: true,
            paginationWorks: true,
            searchPerformance: 'acceptable', // < 500ms
        },
    };
};
exports.performanceScenario = performanceScenario;
/**
 * Error handling and recovery scenario
 */
const errorHandlingScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'error-test-user@test.example',
        firstName: 'Error',
        lastName: 'Test',
    });
    return {
        name: 'Error Handling and Recovery',
        description: 'Test system resilience to various error conditions',
        users: [user],
        activities: [],
        expectedOutcomes: {
            networkErrorHandled: true,
            invalidDataRejected: true,
            authErrorHandled: true,
            gracefulDegradation: true,
            errorReporting: true,
        },
    };
};
exports.errorHandlingScenario = errorHandlingScenario;
/**
 * Mobile app specific scenario
 */
const mobileAppScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'mobile-user@test.example',
        firstName: 'Mobile',
        lastName: 'User',
    });
    const activities = [
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'GPS Tracked Run',
            type: 'running',
            // Include GPS-specific data that would come from mobile
        }),
    ];
    return {
        name: 'Mobile App Features',
        description: 'Test mobile-specific functionality like GPS tracking',
        users: [user],
        activities,
        expectedOutcomes: {
            gpsTrackingWorks: true,
            offlineStorageWorks: true,
            backgroundSyncWorks: true,
            pushNotificationsWork: true,
            biometricAuthWorks: true,
        },
    };
};
exports.mobileAppScenario = mobileAppScenario;
/**
 * Achievement system scenario
 */
const achievementSystemScenario = () => {
    const user = (0, fixtures_1.generateTestUser)({
        email: 'achievement-user@test.example',
        firstName: 'Achievement',
        lastName: 'User',
    });
    // Carefully crafted activities to trigger specific achievements
    const activities = [
        // First activity - should trigger "First Activity" achievement
        (0, fixtures_1.generateTestActivity)(user.id, {
            name: 'First Ever Run',
            type: 'running',
            distance: 5000, // Should trigger "First 5K"
            duration: 1800,
            calories: 350,
        }),
        // Activities on consecutive days for streak achievement
        ...Array.from({ length: 7 }, (_, index) => (0, fixtures_1.generateTestActivity)(user.id, {
            name: `Streak Activity ${index + 1}`,
            type: 'running',
            startTime: new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000),
            endTime: new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
            duration: 1800,
            distance: 3000,
        })),
    ];
    return {
        name: 'Achievement System',
        description: 'Test achievement calculation and notification system',
        users: [user],
        activities,
        expectedOutcomes: {
            firstActivityAchievement: true,
            first5KAchievement: true,
            weeklyStreakAchievement: true,
            achievementNotificationsSent: true,
            achievementMetadataCorrect: true,
        },
    };
};
exports.achievementSystemScenario = achievementSystemScenario;
/**
 * Comprehensive authentication test scenarios
 */
exports.deviceAgnosticAuthScenarios = [
    {
        name: 'Valid Credentials Success',
        description: 'Test successful authentication with valid credentials',
        credentials: {
            email: 'valid.user@turbofit.dev',
            password: 'ValidPassword123!',
            firstName: 'Valid',
            lastName: 'User',
        },
        expectedOutcome: 'success',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'happy-path', 'smoke'],
    },
    {
        name: 'Invalid Email Format',
        description: 'Test authentication failure with malformed email',
        credentials: {
            email: 'invalid-email-format',
            password: 'ValidPassword123!',
        },
        expectedOutcome: 'failure',
        expectedError: 'Please enter a valid email address',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'validation', 'negative'],
    },
    {
        name: 'Weak Password',
        description: 'Test password strength validation',
        credentials: {
            email: 'test@turbofit.dev',
            password: '123',
        },
        expectedOutcome: 'failure',
        expectedError: 'Password must be at least 8 characters',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'validation', 'security'],
    },
    {
        name: 'Empty Credentials',
        description: 'Test required field validation',
        credentials: {
            email: '',
            password: '',
        },
        expectedOutcome: 'failure',
        expectedError: 'Email and password are required',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'validation', 'required-fields'],
    },
    {
        name: 'SQL Injection Attempt',
        description: 'Test security against SQL injection attacks',
        credentials: {
            email: "admin'--",
            password: "' OR '1'='1",
        },
        expectedOutcome: 'failure',
        expectedError: 'Invalid credentials',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'security', 'penetration'],
    },
    {
        name: 'XSS Attempt',
        description: 'Test security against cross-site scripting',
        credentials: {
            email: '<script>alert("xss")</script>',
            password: 'ValidPassword123!',
        },
        expectedOutcome: 'failure',
        expectedError: 'Invalid credentials',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'security', 'xss'],
    },
    {
        name: 'Long Email Address',
        description: 'Test handling of extremely long email addresses',
        credentials: {
            email: 'a'.repeat(255) + '@turbofit.dev',
            password: 'ValidPassword123!',
        },
        expectedOutcome: 'failure',
        expectedError: 'Email is too long',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'validation', 'edge-case'],
    },
    {
        name: 'Special Characters Email',
        description: 'Test authentication with special characters in email',
        credentials: {
            email: 'test+special.chars@turbo-fit.dev',
            password: 'ValidPassword123!',
        },
        expectedOutcome: 'success',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'special-chars', 'edge-case'],
    },
    {
        name: 'Unicode Characters',
        description: 'Test international character support',
        credentials: {
            email: 'tëst@türbö-fit.dev',
            password: 'Pässwörd123!',
            firstName: 'Tëst',
            lastName: 'Üser',
        },
        expectedOutcome: 'success',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'unicode', 'i18n'],
    },
    {
        name: 'Mobile Responsive Form',
        description: 'Test authentication form usability on mobile devices',
        credentials: {
            email: 'mobile.test@turbofit.dev',
            password: 'MobilePassword123!',
        },
        expectedOutcome: 'success',
        platform: 'mobile',
        viewport: 'mobile',
        tags: ['auth', 'responsive', 'mobile'],
    },
    {
        name: 'Tablet Responsive Form',
        description: 'Test authentication form on tablet viewports',
        credentials: {
            email: 'tablet.test@turbofit.dev',
            password: 'TabletPassword123!',
        },
        expectedOutcome: 'success',
        platform: 'web',
        viewport: 'tablet',
        tags: ['auth', 'responsive', 'tablet'],
    },
    {
        name: 'Desktop Large Screen',
        description: 'Test authentication on large desktop screens',
        credentials: {
            email: 'desktop.test@turbofit.dev',
            password: 'DesktopPassword123!',
        },
        expectedOutcome: 'success',
        platform: 'web',
        viewport: 'desktop',
        tags: ['auth', 'responsive', 'desktop'],
    },
    {
        name: 'Rate Limiting Test',
        description: 'Test authentication rate limiting protection',
        credentials: {
            email: 'rate.limit@turbofit.dev',
            password: 'WrongPassword123!',
        },
        expectedOutcome: 'failure',
        expectedError: 'Too many attempts',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'security', 'rate-limiting'],
    },
    {
        name: 'Concurrent Authentication',
        description: 'Test multiple simultaneous authentication attempts',
        credentials: {
            email: 'concurrent.test@turbofit.dev',
            password: 'ConcurrentPassword123!',
        },
        expectedOutcome: 'success',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'performance', 'concurrent'],
    },
    {
        name: 'Network Timeout Handling',
        description: 'Test authentication behavior with slow network',
        credentials: {
            email: 'timeout.test@turbofit.dev',
            password: 'TimeoutPassword123!',
        },
        expectedOutcome: 'success',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'network', 'timeout'],
    },
    {
        name: 'Offline Authentication',
        description: 'Test authentication failure when offline',
        credentials: {
            email: 'offline.test@turbofit.dev',
            password: 'OfflinePassword123!',
        },
        expectedOutcome: 'failure',
        expectedError: 'Network error',
        platform: 'both',
        viewport: 'all',
        tags: ['auth', 'offline', 'network'],
    },
];
/**
 * Cross-platform test scenarios
 */
exports.crossPlatformAuthScenarios = {
    /**
     * Get scenarios by platform
     */
    getByPlatform: (platform) => {
        return exports.deviceAgnosticAuthScenarios.filter(scenario => scenario.platform === platform || scenario.platform === 'both');
    },
    /**
     * Get scenarios by viewport
     */
    getByViewport: (viewport) => {
        return exports.deviceAgnosticAuthScenarios.filter(scenario => scenario.viewport === viewport || scenario.viewport === 'all');
    },
    /**
     * Get scenarios by tags
     */
    getByTags: (tags) => {
        return exports.deviceAgnosticAuthScenarios.filter(scenario => tags.some(tag => scenario.tags.includes(tag)));
    },
    /**
     * Get smoke test scenarios
     */
    getSmokeTests: () => {
        return exports.deviceAgnosticAuthScenarios.filter(scenario => scenario.tags.includes('smoke'));
    },
    /**
     * Get security test scenarios
     */
    getSecurityTests: () => {
        return exports.deviceAgnosticAuthScenarios.filter(scenario => scenario.tags.includes('security'));
    },
    /**
     * Get responsive test scenarios
     */
    getResponsiveTests: () => {
        return exports.deviceAgnosticAuthScenarios.filter(scenario => scenario.tags.includes('responsive'));
    },
};
exports.pageObjectAuthScenarios = [
    {
        name: 'Complete Authentication Flow',
        description: 'Test the complete user authentication journey',
        pages: ['landing', 'sign-in', 'dashboard', 'profile'],
        interactions: [
            { action: 'navigate', target: 'sign-in-link' },
            { action: 'fill', target: 'email-input', data: 'test@turbofit.dev' },
            { action: 'fill', target: 'password-input', data: 'TestPassword123!' },
            { action: 'click', target: 'sign-in-button' },
            { action: 'verify', target: 'dashboard-screen', expectedResult: 'visible' },
            { action: 'navigate', target: 'profile-tab' },
            { action: 'verify', target: 'user-name', expectedResult: 'Test User' },
        ],
        platform: 'both',
        tags: ['auth', 'e2e', 'happy-path'],
    },
    {
        name: 'Registration with Validation Errors',
        description: 'Test sign-up form validation and error handling',
        pages: ['sign-up'],
        interactions: [
            { action: 'navigate', target: 'sign-up-link' },
            { action: 'fill', target: 'email-input', data: 'invalid-email' },
            { action: 'fill', target: 'password-input', data: '123' },
            { action: 'click', target: 'sign-up-button' },
            { action: 'verify', target: 'email-error', expectedResult: 'Please enter a valid email' },
            { action: 'verify', target: 'password-error', expectedResult: 'Password must be at least 8 characters' },
        ],
        platform: 'both',
        tags: ['auth', 'validation', 'error-handling'],
    },
    {
        name: 'Password Reset Flow',
        description: 'Test password reset functionality',
        pages: ['sign-in', 'forgot-password', 'check-email'],
        interactions: [
            { action: 'navigate', target: 'forgot-password-link' },
            { action: 'fill', target: 'email-input', data: 'reset@turbofit.dev' },
            { action: 'click', target: 'send-reset-button' },
            { action: 'verify', target: 'success-message', expectedResult: 'Check your email' },
        ],
        platform: 'both',
        tags: ['auth', 'password-reset', 'email'],
    },
    {
        name: 'Session Management',
        description: 'Test session persistence and expiration',
        pages: ['dashboard', 'sign-in'],
        interactions: [
            { action: 'authenticate', target: 'valid-user' },
            { action: 'verify', target: 'dashboard-screen', expectedResult: 'visible' },
            { action: 'refresh', target: 'page' },
            { action: 'verify', target: 'dashboard-screen', expectedResult: 'visible' },
            { action: 'expire', target: 'session' },
            { action: 'refresh', target: 'page' },
            { action: 'verify', target: 'sign-in-screen', expectedResult: 'visible' },
        ],
        platform: 'both',
        tags: ['auth', 'session', 'security'],
    },
];
/**
 * Export all scenarios as a collection
 */
exports.allTestScenarios = [
    exports.newUserOnboardingScenario,
    exports.activeUserScenario,
    exports.multiUserPrivacyScenario,
    exports.dataSyncScenario,
    exports.performanceScenario,
    exports.errorHandlingScenario,
    exports.mobileAppScenario,
    exports.achievementSystemScenario,
];
/**
 * Get scenario by name
 */
const getScenarioByName = (name) => {
    return exports.allTestScenarios.find(scenario => scenario().name === name)?.();
};
exports.getScenarioByName = getScenarioByName;
/**
 * Get auth scenario by name
 */
const getAuthScenarioByName = (name) => {
    return exports.deviceAgnosticAuthScenarios.find(scenario => scenario.name === name);
};
exports.getAuthScenarioByName = getAuthScenarioByName;
/**
 * Generate test data for auth scenarios
 */
const generateAuthScenarioData = (scenario) => {
    const timestamp = Date.now();
    return {
        ...scenario.credentials,
        email: scenario.credentials.email.replace('@turbofit.dev', `+${timestamp}@turbofit.dev`),
        testId: `auth-test-${timestamp}`,
        timestamp,
    };
};
exports.generateAuthScenarioData = generateAuthScenarioData;
