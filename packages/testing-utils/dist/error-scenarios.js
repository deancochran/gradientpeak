"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorTestUtils = exports.errorSimulation = exports.errorScenarios = void 0;
exports.generateAuthErrorScenarios = generateAuthErrorScenarios;
exports.generateValidationErrorScenarios = generateValidationErrorScenarios;
exports.generateNetworkErrorScenarios = generateNetworkErrorScenarios;
exports.generateDatabaseErrorScenarios = generateDatabaseErrorScenarios;
exports.generateBusinessLogicErrorScenarios = generateBusinessLogicErrorScenarios;
exports.generateRateLimitErrorScenarios = generateRateLimitErrorScenarios;
exports.generateServerErrorScenarios = generateServerErrorScenarios;
exports.generateExternalServiceErrorScenarios = generateExternalServiceErrorScenarios;
exports.getAllErrorScenarios = getAllErrorScenarios;
exports.getErrorScenariosByType = getErrorScenariosByType;
exports.getErrorScenariosBySeverity = getErrorScenariosBySeverity;
exports.getRetryableErrorScenarios = getRetryableErrorScenarios;
exports.getRandomErrorScenario = getRandomErrorScenario;
const api_mocks_1 = require("./api-mocks");
/**
 * Generate authentication error scenarios
 */
function generateAuthErrorScenarios() {
    return [
        {
            id: 'auth-invalid-credentials',
            name: 'Invalid Credentials',
            type: 'authentication',
            severity: 'medium',
            statusCode: 401,
            message: 'Invalid email or password',
            errorCode: 'INVALID_CREDENTIALS',
            userMessage: 'The email or password you entered is incorrect. Please try again.',
            recovery: ['Check your email and password', 'Use "Forgot Password" if needed'],
            retryable: true,
            error: new Error('Invalid email or password'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Invalid email or password', 'Authentication failed'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(401, (0, api_mocks_1.createMockApiError)('Invalid email or password')),
        },
        {
            id: 'auth-token-expired',
            name: 'Expired Token',
            type: 'authentication',
            severity: 'medium',
            statusCode: 401,
            message: 'Your session has expired',
            errorCode: 'TOKEN_EXPIRED',
            userMessage: 'Your session has expired. Please sign in again.',
            recovery: ['Sign in again', 'Enable "Remember me" for longer sessions'],
            retryable: false,
            error: new Error('JWT token has expired'),
            apiResponse: (0, api_mocks_1.createMockApiError)('JWT token has expired', 'Token expired'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(401, (0, api_mocks_1.createMockApiError)('JWT token has expired')),
        },
        {
            id: 'auth-account-locked',
            name: 'Account Locked',
            type: 'authentication',
            severity: 'high',
            statusCode: 423,
            message: 'Account has been temporarily locked',
            errorCode: 'ACCOUNT_LOCKED',
            userMessage: 'Your account has been temporarily locked due to multiple failed login attempts.',
            recovery: ['Wait 15 minutes before trying again', 'Contact support if issue persists'],
            retryable: false,
            error: new Error('Account locked due to multiple failed attempts'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Account locked', 'Account locked'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(423, (0, api_mocks_1.createMockApiError)('Account locked')),
        },
        {
            id: 'auth-insufficient-permissions',
            name: 'Insufficient Permissions',
            type: 'authorization',
            severity: 'medium',
            statusCode: 403,
            message: 'You do not have permission to access this resource',
            errorCode: 'INSUFFICIENT_PERMISSIONS',
            userMessage: 'You don\'t have permission to perform this action.',
            recovery: ['Contact an administrator', 'Check if you have the required role'],
            retryable: false,
            error: new Error('Insufficient permissions'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Insufficient permissions', 'Access denied'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(403, (0, api_mocks_1.createMockApiError)('Insufficient permissions')),
        },
    ];
}
/**
 * Generate validation error scenarios
 */
function generateValidationErrorScenarios() {
    return [
        {
            id: 'validation-missing-required-fields',
            name: 'Missing Required Fields',
            type: 'validation',
            severity: 'medium',
            statusCode: 422,
            message: 'Required fields are missing',
            errorCode: 'MISSING_REQUIRED_FIELDS',
            details: { missingFields: ['email', 'password'] },
            userMessage: 'Please fill in all required fields.',
            recovery: ['Complete all required fields', 'Check for any validation errors'],
            retryable: true,
            error: new Error('Missing required fields: email, password'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Missing required fields', 'Validation failed'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(422, (0, api_mocks_1.createMockApiError)('Missing required fields')),
        },
        {
            id: 'validation-invalid-email-format',
            name: 'Invalid Email Format',
            type: 'validation',
            severity: 'low',
            statusCode: 422,
            message: 'Email address format is invalid',
            errorCode: 'INVALID_EMAIL_FORMAT',
            details: { field: 'email', value: 'invalid-email' },
            userMessage: 'Please enter a valid email address.',
            recovery: ['Check email format (e.g., user@example.com)', 'Remove any extra spaces'],
            retryable: true,
            error: new Error('Invalid email format'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Invalid email format', 'Validation failed'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(422, (0, api_mocks_1.createMockApiError)('Invalid email format')),
        },
        {
            id: 'validation-password-too-weak',
            name: 'Password Too Weak',
            type: 'validation',
            severity: 'medium',
            statusCode: 422,
            message: 'Password does not meet security requirements',
            errorCode: 'WEAK_PASSWORD',
            details: {
                requirements: ['At least 8 characters', 'One uppercase letter', 'One number', 'One special character']
            },
            userMessage: 'Password must be at least 8 characters with uppercase, number, and special character.',
            recovery: ['Use a stronger password', 'Include uppercase, lowercase, numbers, and symbols'],
            retryable: true,
            error: new Error('Password too weak'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Password too weak', 'Validation failed'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(422, (0, api_mocks_1.createMockApiError)('Password too weak')),
        },
        {
            id: 'validation-file-too-large',
            name: 'File Too Large',
            type: 'validation',
            severity: 'medium',
            statusCode: 413,
            message: 'File size exceeds maximum limit',
            errorCode: 'FILE_TOO_LARGE',
            details: { maxSize: '10MB', actualSize: '15MB' },
            userMessage: 'File is too large. Maximum size is 10MB.',
            recovery: ['Compress the file', 'Choose a smaller file', 'Split large files into multiple uploads'],
            retryable: true,
            error: new Error('File too large'),
            apiResponse: (0, api_mocks_1.createMockApiError)('File too large', 'File upload failed'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(413, (0, api_mocks_1.createMockApiError)('File too large')),
        },
    ];
}
/**
 * Generate network error scenarios
 */
function generateNetworkErrorScenarios() {
    return [
        {
            id: 'network-connection-timeout',
            name: 'Connection Timeout',
            type: 'network',
            severity: 'medium',
            message: 'Request timed out',
            errorCode: 'TIMEOUT',
            userMessage: 'The request took too long to complete. Please try again.',
            recovery: ['Check your internet connection', 'Try again', 'Try again later if server is busy'],
            retryable: true,
            error: new Error('ETIMEDOUT: Request timeout'),
        },
        {
            id: 'network-connection-refused',
            name: 'Connection Refused',
            type: 'network',
            severity: 'high',
            message: 'Unable to connect to server',
            errorCode: 'CONNECTION_REFUSED',
            userMessage: 'Unable to connect to the server. Please try again later.',
            recovery: ['Check your internet connection', 'Try again in a few minutes', 'Check if service is under maintenance'],
            retryable: true,
            error: new Error('ECONNREFUSED: Connection refused'),
        },
        {
            id: 'network-dns-failure',
            name: 'DNS Resolution Failed',
            type: 'network',
            severity: 'high',
            message: 'Unable to resolve server address',
            errorCode: 'DNS_FAILURE',
            userMessage: 'Unable to reach the server. Please check your connection.',
            recovery: ['Check your internet connection', 'Try a different network', 'Check DNS settings'],
            retryable: true,
            error: new Error('ENOTFOUND: DNS resolution failed'),
        },
        {
            id: 'network-offline',
            name: 'No Internet Connection',
            type: 'network',
            severity: 'critical',
            message: 'No internet connection available',
            errorCode: 'OFFLINE',
            userMessage: 'You appear to be offline. Please check your internet connection.',
            recovery: ['Check your internet connection', 'Try connecting to a different network', 'Enable mobile data'],
            retryable: true,
            error: new Error('Network offline'),
        },
    ];
}
/**
 * Generate database error scenarios
 */
function generateDatabaseErrorScenarios() {
    return [
        {
            id: 'db-connection-failed',
            name: 'Database Connection Failed',
            type: 'database',
            severity: 'critical',
            statusCode: 503,
            message: 'Unable to connect to database',
            errorCode: 'DB_CONNECTION_FAILED',
            userMessage: 'Service temporarily unavailable. Please try again later.',
            recovery: ['Try again in a few minutes', 'Contact support if issue persists'],
            retryable: true,
            error: new Error('Database connection failed'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Database unavailable', 'Service unavailable'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(503, (0, api_mocks_1.createMockApiError)('Database unavailable')),
        },
        {
            id: 'db-constraint-violation',
            name: 'Database Constraint Violation',
            type: 'database',
            severity: 'medium',
            statusCode: 409,
            message: 'Data violates database constraints',
            errorCode: 'CONSTRAINT_VIOLATION',
            details: { constraint: 'unique_email', table: 'users' },
            userMessage: 'This email address is already registered.',
            recovery: ['Use a different email address', 'Sign in if you already have an account'],
            retryable: false,
            error: new Error('Unique constraint violation'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Email already exists', 'Constraint violation'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(409, (0, api_mocks_1.createMockApiError)('Email already exists')),
        },
        {
            id: 'db-query-timeout',
            name: 'Database Query Timeout',
            type: 'database',
            severity: 'medium',
            statusCode: 504,
            message: 'Database query timed out',
            errorCode: 'QUERY_TIMEOUT',
            userMessage: 'The operation is taking longer than expected. Please try again.',
            recovery: ['Try again', 'Try again later during off-peak hours'],
            retryable: true,
            error: new Error('Database query timeout'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Query timeout', 'Request timeout'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(504, (0, api_mocks_1.createMockApiError)('Query timeout')),
        },
    ];
}
/**
 * Generate business logic error scenarios
 */
function generateBusinessLogicErrorScenarios() {
    return [
        {
            id: 'business-activity-limit-exceeded',
            name: 'Activity Limit Exceeded',
            type: 'business-logic',
            severity: 'medium',
            statusCode: 429,
            message: 'Daily activity upload limit exceeded',
            errorCode: 'ACTIVITY_LIMIT_EXCEEDED',
            details: { limit: 10, used: 10 },
            userMessage: 'You\'ve reached your daily activity upload limit (10 activities).',
            recovery: ['Try again tomorrow', 'Upgrade to premium for unlimited uploads'],
            retryable: false,
            error: new Error('Activity limit exceeded'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Activity limit exceeded', 'Limit exceeded'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(429, (0, api_mocks_1.createMockApiError)('Activity limit exceeded')),
        },
        {
            id: 'business-invalid-activity-data',
            name: 'Invalid Activity Data',
            type: 'business-logic',
            severity: 'medium',
            statusCode: 422,
            message: 'Activity data contains invalid values',
            errorCode: 'INVALID_ACTIVITY_DATA',
            details: { issues: ['Start time is in the future', 'Duration is negative'] },
            userMessage: 'The activity data contains errors that need to be fixed.',
            recovery: ['Check start and end times', 'Ensure all values are realistic', 'Re-record the activity if needed'],
            retryable: true,
            error: new Error('Invalid activity data'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Invalid activity data', 'Data validation failed'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(422, (0, api_mocks_1.createMockApiError)('Invalid activity data')),
        },
        {
            id: 'business-subscription-expired',
            name: 'Subscription Expired',
            type: 'business-logic',
            severity: 'high',
            statusCode: 402,
            message: 'Premium subscription has expired',
            errorCode: 'SUBSCRIPTION_EXPIRED',
            userMessage: 'Your premium subscription has expired. Please renew to continue using premium features.',
            recovery: ['Renew your subscription', 'Contact support for assistance'],
            retryable: false,
            error: new Error('Subscription expired'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Subscription expired', 'Payment required'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(402, (0, api_mocks_1.createMockApiError)('Subscription expired')),
        },
    ];
}
/**
 * Generate rate limit error scenarios
 */
function generateRateLimitErrorScenarios() {
    return [
        {
            id: 'rate-limit-api-calls',
            name: 'API Rate Limit Exceeded',
            type: 'rate-limit',
            severity: 'medium',
            statusCode: 429,
            message: 'Too many API requests',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            details: { limit: 100, windowMs: 60000, retryAfter: 45 },
            userMessage: 'You\'re making requests too quickly. Please wait a moment and try again.',
            recovery: ['Wait 45 seconds', 'Reduce the frequency of requests'],
            retryable: true,
            error: new Error('Rate limit exceeded'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Rate limit exceeded', 'Too many requests'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(429, (0, api_mocks_1.createMockApiError)('Rate limit exceeded'), {
                'retry-after': '45',
                'x-ratelimit-limit': '100',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Date.now() + 45000),
            }),
        },
        {
            id: 'rate-limit-login-attempts',
            name: 'Login Rate Limit',
            type: 'rate-limit',
            severity: 'high',
            statusCode: 429,
            message: 'Too many login attempts',
            errorCode: 'LOGIN_RATE_LIMIT',
            details: { attempts: 5, lockoutMs: 900000 }, // 15 minutes
            userMessage: 'Too many failed login attempts. Please wait 15 minutes before trying again.',
            recovery: ['Wait 15 minutes', 'Use "Forgot Password" if you can\'t remember your password'],
            retryable: false,
            error: new Error('Too many login attempts'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Too many login attempts', 'Account temporarily locked'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(429, (0, api_mocks_1.createMockApiError)('Too many login attempts')),
        },
    ];
}
/**
 * Generate server error scenarios
 */
function generateServerErrorScenarios() {
    return [
        {
            id: 'server-internal-error',
            name: 'Internal Server Error',
            type: 'server',
            severity: 'critical',
            statusCode: 500,
            message: 'Internal server error occurred',
            errorCode: 'INTERNAL_SERVER_ERROR',
            userMessage: 'Something went wrong on our end. Please try again later.',
            recovery: ['Try again', 'Contact support if issue persists'],
            retryable: true,
            error: new Error('Internal server error'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Internal server error', 'Server error'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(500, (0, api_mocks_1.createMockApiError)('Internal server error')),
        },
        {
            id: 'server-maintenance',
            name: 'Server Under Maintenance',
            type: 'server',
            severity: 'high',
            statusCode: 503,
            message: 'Server is under maintenance',
            errorCode: 'MAINTENANCE_MODE',
            userMessage: 'The service is temporarily down for maintenance. Please try again later.',
            recovery: ['Try again in 30 minutes', 'Check status page for updates'],
            retryable: true,
            error: new Error('Server under maintenance'),
            apiResponse: (0, api_mocks_1.createMockApiError)('Server under maintenance', 'Service unavailable'),
            httpResponse: (0, api_mocks_1.createMockHttpResponse)(503, (0, api_mocks_1.createMockApiError)('Server under maintenance')),
        },
    ];
}
/**
 * Generate external service error scenarios
 */
function generateExternalServiceErrorScenarios() {
    return [
        {
            id: 'external-clerk-service-down',
            name: 'Clerk Authentication Service Down',
            type: 'external-service',
            severity: 'critical',
            message: 'Authentication service is unavailable',
            errorCode: 'CLERK_SERVICE_DOWN',
            userMessage: 'Authentication service is temporarily unavailable. Please try again later.',
            recovery: ['Try again in a few minutes', 'Contact support if issue persists'],
            retryable: true,
            error: new Error('Clerk service unavailable'),
        },
        {
            id: 'external-supabase-service-down',
            name: 'Supabase Database Service Down',
            type: 'external-service',
            severity: 'critical',
            message: 'Database service is unavailable',
            errorCode: 'SUPABASE_SERVICE_DOWN',
            userMessage: 'Data service is temporarily unavailable. Please try again later.',
            recovery: ['Try again in a few minutes', 'Check Supabase status page'],
            retryable: true,
            error: new Error('Supabase service unavailable'),
        },
    ];
}
/**
 * Comprehensive error scenario collections
 */
exports.errorScenarios = {
    auth: generateAuthErrorScenarios(),
    validation: generateValidationErrorScenarios(),
    network: generateNetworkErrorScenarios(),
    database: generateDatabaseErrorScenarios(),
    businessLogic: generateBusinessLogicErrorScenarios(),
    rateLimit: generateRateLimitErrorScenarios(),
    server: generateServerErrorScenarios(),
    externalService: generateExternalServiceErrorScenarios(),
};
/**
 * Get all error scenarios
 */
function getAllErrorScenarios() {
    return Object.values(exports.errorScenarios).flat();
}
/**
 * Get error scenarios by type
 */
function getErrorScenariosByType(type) {
    return getAllErrorScenarios().filter(scenario => scenario.type === type);
}
/**
 * Get error scenarios by severity
 */
function getErrorScenariosBySeverity(severity) {
    return getAllErrorScenarios().filter(scenario => scenario.severity === severity);
}
/**
 * Get retryable error scenarios
 */
function getRetryableErrorScenarios() {
    return getAllErrorScenarios().filter(scenario => scenario.retryable);
}
/**
 * Get random error scenario
 */
function getRandomErrorScenario(filters) {
    let scenarios = getAllErrorScenarios();
    if (filters) {
        if (filters.type) {
            scenarios = scenarios.filter(s => s.type === filters.type);
        }
        if (filters.severity) {
            scenarios = scenarios.filter(s => s.severity === filters.severity);
        }
        if (filters.retryable !== undefined) {
            scenarios = scenarios.filter(s => s.retryable === filters.retryable);
        }
    }
    if (scenarios.length === 0) {
        throw new Error('No error scenarios match the given filters');
    }
    return scenarios[Math.floor(Math.random() * scenarios.length)];
}
/**
 * Error simulation utilities
 */
exports.errorSimulation = {
    /**
     * Simulate network failure
     */
    simulateNetworkFailure: (type = 'timeout') => {
        const scenario = getErrorScenariosByType('network').find(s => s.id.includes(type));
        if (!scenario) {
            throw new Error(`No network error scenario found for type: ${type}`);
        }
        return scenario.error;
    },
    /**
     * Simulate authentication failure
     */
    simulateAuthFailure: (type = 'invalid-credentials') => {
        const scenario = getErrorScenariosByType('authentication').find(s => s.id.includes(type));
        if (!scenario) {
            throw new Error(`No auth error scenario found for type: ${type}`);
        }
        return scenario.error;
    },
    /**
     * Simulate validation failure
     */
    simulateValidationFailure: (type = 'missing-fields') => {
        const scenario = getErrorScenariosByType('validation').find(s => s.id.includes(type));
        if (!scenario) {
            throw new Error(`No validation error scenario found for type: ${type}`);
        }
        return scenario.error;
    },
    /**
     * Simulate random error with specified probability
     */
    simulateRandomError: (probability = 0.1, filters) => {
        if (Math.random() < probability) {
            const scenario = getRandomErrorScenario(filters);
            throw scenario.error;
        }
    },
};
/**
 * Error testing utilities
 */
exports.errorTestUtils = {
    /**
     * Test error handling for a function
     */
    async testErrorHandling(fn, expectedErrorScenario) {
        try {
            await fn();
            return { handled: false };
        }
        catch (actualError) {
            const expectedErrorMessage = expectedErrorScenario.message;
            const actualErrorMessage = actualError.message;
            const handled = actualErrorMessage.includes(expectedErrorMessage) ||
                expectedErrorMessage.includes(actualErrorMessage);
            return { handled, actualError };
        }
    },
    /**
     * Assert that function throws expected error
     */
    async assertThrowsErrorScenario(fn, expectedScenario) {
        const result = await this.testErrorHandling(fn, expectedScenario);
        if (!result.handled) {
            throw new Error(`Expected function to throw error matching scenario "${expectedScenario.name}", but no error was thrown`);
        }
    },
    /**
     * Create error boundary test component (for React testing)
     */
    createErrorBoundaryTest: (expectedError) => ({
        error: expectedError.error,
        expectedMessage: expectedError.userMessage || expectedError.message,
        expectedRecovery: expectedError.recovery,
    }),
};
