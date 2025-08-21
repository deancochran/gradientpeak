"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockApiClient = exports.apiErrorScenarios = exports.mockHttpResponses = exports.mockApiResponses = void 0;
exports.createMockApiSuccess = createMockApiSuccess;
exports.createMockApiError = createMockApiError;
exports.createMockPaginatedResponse = createMockPaginatedResponse;
exports.createMockHttpResponse = createMockHttpResponse;
exports.createMockFetch = createMockFetch;
const crypto_1 = require("crypto");
const inline_helpers_1 = require("./inline-helpers");
/**
 * Create a mock successful API response
 */
function createMockApiSuccess(data, message = 'Request successful') {
    return {
        success: true,
        data,
        message,
        meta: {
            timestamp: new Date().toISOString(),
            requestId: (0, crypto_1.randomUUID)(),
        },
    };
}
/**
 * Create a mock error API response
 */
function createMockApiError(error, message = 'Request failed') {
    return {
        success: false,
        error,
        message,
        meta: {
            timestamp: new Date().toISOString(),
            requestId: (0, crypto_1.randomUUID)(),
        },
    };
}
/**
 * Create a mock paginated API response
 */
function createMockPaginatedResponse(items, paginationOptions = {}) {
    const pagination = (0, inline_helpers_1.fakePaginationMeta)(paginationOptions.total || items.length, paginationOptions.page || 1, paginationOptions.limit || 10);
    return {
        success: true,
        data: items,
        message: 'Items retrieved successfully',
        meta: {
            pagination,
            timestamp: new Date().toISOString(),
            requestId: (0, crypto_1.randomUUID)(),
        },
    };
}
/**
 * Create a mock HTTP response
 */
function createMockHttpResponse(status, data, headers = {}) {
    const statusText = getStatusText(status);
    return {
        status,
        statusText,
        headers: {
            'content-type': 'application/json',
            'x-request-id': (0, crypto_1.randomUUID)(),
            ...headers,
        },
        data,
        ok: status >= 200 && status < 300,
    };
}
/**
 * Get HTTP status text for a given status code
 */
function getStatusText(status) {
    const statusTexts = {
        200: 'OK',
        201: 'Created',
        202: 'Accepted',
        204: 'No Content',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout',
    };
    return statusTexts[status] || 'Unknown';
}
/**
 * Mock API responses for common TurboFit endpoints
 */
exports.mockApiResponses = {
    /**
     * Mock authentication responses
     */
    auth: {
        signInSuccess: () => createMockApiSuccess({
            user: {
                id: (0, inline_helpers_1.fakeUserId)(),
                email: (0, inline_helpers_1.fakeEmail)(),
                firstName: 'Test',
                lastName: 'User',
            },
            token: `mock-token-${(0, crypto_1.randomUUID)()}`,
        }, 'Sign in successful'),
        signInError: (error = 'Invalid credentials') => createMockApiError(error, 'Sign in failed'),
        signUpSuccess: () => createMockApiSuccess({
            user: {
                id: (0, inline_helpers_1.fakeUserId)(),
                email: (0, inline_helpers_1.fakeEmail)(),
                firstName: 'New',
                lastName: 'User',
            },
            requiresVerification: false,
        }, 'Account created successfully'),
        signUpError: (error = 'Email already exists') => createMockApiError(error, 'Account creation failed'),
        signOutSuccess: () => createMockApiSuccess(null, 'Signed out successfully'),
    },
    /**
     * Mock user management responses
     */
    users: {
        getProfileSuccess: () => createMockApiSuccess({
            id: (0, inline_helpers_1.fakeUserId)(),
            email: (0, inline_helpers_1.fakeEmail)(),
            firstName: 'Test',
            lastName: 'User',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }, 'Profile retrieved successfully'),
        updateProfileSuccess: () => createMockApiSuccess({
            id: (0, inline_helpers_1.fakeUserId)(),
            email: (0, inline_helpers_1.fakeEmail)(),
            firstName: 'Updated',
            lastName: 'User',
            updatedAt: new Date().toISOString(),
        }, 'Profile updated successfully'),
        deleteProfileSuccess: () => createMockApiSuccess(null, 'Profile deleted successfully'),
        profileNotFound: () => createMockApiError('Profile not found', 'User not found'),
    },
    /**
     * Mock activity management responses
     */
    activities: {
        getActivitiesSuccess: (count = 5) => {
            const activities = Array.from({ length: count }, () => ({
                id: (0, crypto_1.randomUUID)(),
                userId: (0, inline_helpers_1.fakeUserId)(),
                name: (0, inline_helpers_1.fakeActivityName)(),
                type: (0, inline_helpers_1.fakeActivityType)(),
                startTime: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                duration: Math.floor(Math.random() * 7200) + 600, // 10 minutes to 2 hours
                distance: Math.floor(Math.random() * 20000) + 1000, // 1km to 20km
                calories: Math.floor(Math.random() * 600) + 200, // 200 to 800 calories
                elevationGain: Math.floor(Math.random() * 500), // 0 to 500m
            }));
            return createMockPaginatedResponse(activities, { total: 25 });
        },
        createActivitySuccess: () => createMockApiSuccess({
            id: (0, crypto_1.randomUUID)(),
            userId: (0, inline_helpers_1.fakeUserId)(),
            name: (0, inline_helpers_1.fakeActivityName)(),
            type: (0, inline_helpers_1.fakeActivityType)(),
            startTime: new Date().toISOString(),
            duration: 3600,
            distance: 10000,
            calories: 500,
            elevationGain: 100,
            createdAt: new Date().toISOString(),
        }, 'Activity created successfully'),
        updateActivitySuccess: () => createMockApiSuccess({
            id: (0, crypto_1.randomUUID)(),
            name: 'Updated Activity',
            updatedAt: new Date().toISOString(),
        }, 'Activity updated successfully'),
        deleteActivitySuccess: () => createMockApiSuccess(null, 'Activity deleted successfully'),
        activityNotFound: () => createMockApiError('Activity not found', 'Activity not found'),
    },
    /**
     * Mock analytics responses
     */
    analytics: {
        getDashboardStatsSuccess: () => createMockApiSuccess({
            totalActivities: 42,
            totalDistance: 250000, // 250km
            totalDuration: 86400, // 24 hours
            totalCalories: 12500,
            weeklyStats: {
                activities: 7,
                distance: 50000, // 50km
                duration: 14400, // 4 hours
                calories: 2500,
            },
            recentActivities: 3,
        }, 'Dashboard stats retrieved successfully'),
        getWeeklyReportSuccess: () => createMockApiSuccess({
            weekOf: new Date().toISOString().split('T')[0],
            totalActivities: 5,
            totalDistance: 35000,
            totalDuration: 10800,
            totalCalories: 1800,
            dailyBreakdown: Array.from({ length: 7 }, (_, i) => ({
                date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                activities: Math.floor(Math.random() * 3),
                distance: Math.floor(Math.random() * 10000),
                duration: Math.floor(Math.random() * 3600),
                calories: Math.floor(Math.random() * 600),
            })),
        }, 'Weekly report retrieved successfully'),
    },
    /**
     * Mock webhook responses
     */
    webhooks: {
        clerkWebhookSuccess: () => createMockApiSuccess(null, 'Webhook processed successfully'),
        clerkWebhookError: (error = 'Invalid webhook signature') => createMockApiError(error, 'Webhook processing failed'),
    },
    /**
     * Mock file upload responses
     */
    uploads: {
        uploadSuccess: (fileName = 'activity.fit') => createMockApiSuccess({
            id: (0, crypto_1.randomUUID)(),
            fileName,
            fileSize: Math.floor(Math.random() * 1000000) + 10000, // 10KB to 1MB
            url: `https://storage.example.com/uploads/${(0, crypto_1.randomUUID)()}/${fileName}`,
            uploadedAt: new Date().toISOString(),
        }, 'File uploaded successfully'),
        uploadError: (error = 'File upload failed') => createMockApiError(error, 'Upload failed'),
    },
};
/**
 * Mock HTTP response scenarios for different status codes
 */
exports.mockHttpResponses = {
    /**
     * 2xx Success responses
     */
    success: {
        ok: (data) => createMockHttpResponse(200, data),
        created: (data) => createMockHttpResponse(201, data),
        accepted: (data) => createMockHttpResponse(202, data),
        noContent: () => createMockHttpResponse(204, null),
    },
    /**
     * 4xx Client error responses
     */
    clientError: {
        badRequest: (message = 'Bad Request') => createMockHttpResponse(400, createMockApiError(message)),
        unauthorized: (message = 'Unauthorized') => createMockHttpResponse(401, createMockApiError(message)),
        forbidden: (message = 'Forbidden') => createMockHttpResponse(403, createMockApiError(message)),
        notFound: (message = 'Not Found') => createMockHttpResponse(404, createMockApiError(message)),
        conflict: (message = 'Conflict') => createMockHttpResponse(409, createMockApiError(message)),
        unprocessableEntity: (message = 'Validation failed') => createMockHttpResponse(422, createMockApiError(message)),
        tooManyRequests: (message = 'Rate limit exceeded') => createMockHttpResponse(429, createMockApiError(message)),
    },
    /**
     * 5xx Server error responses
     */
    serverError: {
        internalServerError: (message = 'Internal Server Error') => createMockHttpResponse(500, createMockApiError(message)),
        badGateway: (message = 'Bad Gateway') => createMockHttpResponse(502, createMockApiError(message)),
        serviceUnavailable: (message = 'Service Unavailable') => createMockHttpResponse(503, createMockApiError(message)),
        gatewayTimeout: (message = 'Gateway Timeout') => createMockHttpResponse(504, createMockApiError(message)),
    },
};
/**
 * Mock fetch function for testing HTTP requests
 */
function createMockFetch(responses = {}) {
    const defaultResponses = responses;
    const mockFetch = jest.fn(async (url, options = {}) => {
        const urlString = typeof url === 'string' ? url : url.toString();
        const method = options.method || 'GET';
        const key = `${method} ${urlString}`;
        // Check if we have a specific response for this request
        const mockResponse = defaultResponses[key] || defaultResponses[urlString];
        if (!mockResponse) {
            // Return a generic 404 if no mock response is configured
            return new Response(JSON.stringify(createMockApiError('Not Found')), {
                status: 404,
                statusText: 'Not Found',
                headers: { 'content-type': 'application/json' },
            });
        }
        return new Response(JSON.stringify(mockResponse.data), {
            status: mockResponse.status,
            statusText: mockResponse.statusText,
            headers: mockResponse.headers,
        });
    });
    return {
        mockFetch,
        /**
         * Add a mock response for a specific URL and method
         */
        addMockResponse: (url, response, method = 'GET') => {
            defaultResponses[`${method} ${url}`] = response;
        },
        /**
         * Clear all mock responses
         */
        clearMockResponses: () => {
            Object.keys(defaultResponses).forEach(key => delete defaultResponses[key]);
        },
        /**
         * Get call history
         */
        getCallHistory: () => mockFetch.mock.calls,
        /**
         * Reset call history
         */
        resetCallHistory: () => mockFetch.mockClear(),
    };
}
/**
 * API error scenarios for comprehensive testing
 */
exports.apiErrorScenarios = {
    /**
     * Network connectivity errors
     */
    network: {
        connectionRefused: () => createMockApiError('ECONNREFUSED', 'Connection refused'),
        timeout: () => createMockApiError('ETIMEDOUT', 'Request timeout'),
        networkError: () => createMockApiError('Network Error', 'Network request failed'),
    },
    /**
     * Authentication errors
     */
    auth: {
        invalidToken: () => createMockApiError('Invalid token', 'Authentication failed'),
        expiredToken: () => createMockApiError('Token expired', 'Authentication failed'),
        insufficientPermissions: () => createMockApiError('Insufficient permissions', 'Access denied'),
    },
    /**
     * Validation errors
     */
    validation: {
        missingFields: (fields) => createMockApiError(`Missing required fields: ${fields.join(', ')}`, 'Validation failed'),
        invalidFormat: (field) => createMockApiError(`Invalid format for field: ${field}`, 'Validation failed'),
        valueTooLong: (field, maxLength) => createMockApiError(`Field ${field} exceeds maximum length of ${maxLength}`, 'Validation failed'),
    },
    /**
     * Business logic errors
     */
    business: {
        duplicateEntry: (resource) => createMockApiError(`${resource} already exists`, 'Duplicate entry'),
        resourceNotFound: (resource) => createMockApiError(`${resource} not found`, 'Resource not found'),
        operationNotAllowed: (operation) => createMockApiError(`${operation} not allowed`, 'Operation not permitted'),
    },
    /**
     * Rate limiting errors
     */
    rateLimit: {
        tooManyRequests: () => createMockApiError('Too many requests', 'Rate limit exceeded'),
        quotaExceeded: () => createMockApiError('API quota exceeded', 'Quota exceeded'),
    },
};
/**
 * Mock API client for testing
 */
class MockApiClient {
    baseUrl;
    defaultHeaders;
    mockResponses;
    constructor(baseUrl = 'https://api.turbofit.dev', defaultHeaders = {}) {
        this.baseUrl = baseUrl;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            ...defaultHeaders,
        };
        this.mockResponses = {};
    }
    /**
     * Set mock response for an endpoint
     */
    setMockResponse(method, path, response) {
        const key = `${method.toUpperCase()} ${path}`;
        this.mockResponses[key] = response;
    }
    /**
     * Mock GET request
     */
    async get(path, headers = {}) {
        const key = `GET ${path}`;
        return this.mockResponses[key] || exports.mockHttpResponses.clientError.notFound();
    }
    /**
     * Mock POST request
     */
    async post(path, data, headers = {}) {
        const key = `POST ${path}`;
        return this.mockResponses[key] || exports.mockHttpResponses.success.created(data);
    }
    /**
     * Mock PUT request
     */
    async put(path, data, headers = {}) {
        const key = `PUT ${path}`;
        return this.mockResponses[key] || exports.mockHttpResponses.success.ok(data);
    }
    /**
     * Mock DELETE request
     */
    async delete(path, headers = {}) {
        const key = `DELETE ${path}`;
        return this.mockResponses[key] || exports.mockHttpResponses.success.noContent();
    }
    /**
     * Clear all mock responses
     */
    clearMockResponses() {
        this.mockResponses = {};
    }
}
exports.MockApiClient = MockApiClient;
