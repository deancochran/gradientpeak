/**
 * API response mocking utilities for testing
 * These utilities provide realistic mock API responses
 * for various endpoints in the TurboFit application.
 */
/**
 * Standard API response structure
 */
export interface MockApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    meta?: {
        pagination?: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            hasNext: boolean;
            hasPrev: boolean;
        };
        timestamp?: string;
        requestId?: string;
    };
}
/**
 * Mock HTTP response structure
 */
export interface MockHttpResponse<T = any> {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: T;
    ok: boolean;
}
/**
 * Create a mock successful API response
 */
export declare function createMockApiSuccess<T>(data: T, message?: string): MockApiResponse<T>;
/**
 * Create a mock error API response
 */
export declare function createMockApiError(error: string, message?: string): MockApiResponse;
/**
 * Create a mock paginated API response
 */
export declare function createMockPaginatedResponse<T>(items: T[], paginationOptions?: {
    total?: number;
    page?: number;
    limit?: number;
}): MockApiResponse<T[]>;
/**
 * Create a mock HTTP response
 */
export declare function createMockHttpResponse<T>(status: number, data: T, headers?: Record<string, string>): MockHttpResponse<T>;
/**
 * Mock API responses for common TurboFit endpoints
 */
export declare const mockApiResponses: {
    /**
     * Mock authentication responses
     */
    auth: {
        signInSuccess: () => MockApiResponse<{
            user: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
            };
            token: string;
        }>;
        signInError: (error?: string) => MockApiResponse<any>;
        signUpSuccess: () => MockApiResponse<{
            user: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
            };
            requiresVerification: boolean;
        }>;
        signUpError: (error?: string) => MockApiResponse<any>;
        signOutSuccess: () => MockApiResponse<null>;
    };
    /**
     * Mock user management responses
     */
    users: {
        getProfileSuccess: () => MockApiResponse<{
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            createdAt: string;
            updatedAt: string;
        }>;
        updateProfileSuccess: () => MockApiResponse<{
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            updatedAt: string;
        }>;
        deleteProfileSuccess: () => MockApiResponse<null>;
        profileNotFound: () => MockApiResponse<any>;
    };
    /**
     * Mock activity management responses
     */
    activities: {
        getActivitiesSuccess: (count?: number) => MockApiResponse<{
            id: `${string}-${string}-${string}-${string}-${string}`;
            userId: string;
            name: string;
            type: "running" | "cycling" | "swimming" | "walking" | "other";
            startTime: string;
            duration: number;
            distance: number;
            calories: number;
            elevationGain: number;
        }[]>;
        createActivitySuccess: () => MockApiResponse<{
            id: `${string}-${string}-${string}-${string}-${string}`;
            userId: string;
            name: string;
            type: "running" | "cycling" | "swimming" | "walking" | "other";
            startTime: string;
            duration: number;
            distance: number;
            calories: number;
            elevationGain: number;
            createdAt: string;
        }>;
        updateActivitySuccess: () => MockApiResponse<{
            id: `${string}-${string}-${string}-${string}-${string}`;
            name: string;
            updatedAt: string;
        }>;
        deleteActivitySuccess: () => MockApiResponse<null>;
        activityNotFound: () => MockApiResponse<any>;
    };
    /**
     * Mock analytics responses
     */
    analytics: {
        getDashboardStatsSuccess: () => MockApiResponse<{
            totalActivities: number;
            totalDistance: number;
            totalDuration: number;
            totalCalories: number;
            weeklyStats: {
                activities: number;
                distance: number;
                duration: number;
                calories: number;
            };
            recentActivities: number;
        }>;
        getWeeklyReportSuccess: () => MockApiResponse<{
            weekOf: string | undefined;
            totalActivities: number;
            totalDistance: number;
            totalDuration: number;
            totalCalories: number;
            dailyBreakdown: {
                date: string | undefined;
                activities: number;
                distance: number;
                duration: number;
                calories: number;
            }[];
        }>;
    };
    /**
     * Mock webhook responses
     */
    webhooks: {
        clerkWebhookSuccess: () => MockApiResponse<null>;
        clerkWebhookError: (error?: string) => MockApiResponse<any>;
    };
    /**
     * Mock file upload responses
     */
    uploads: {
        uploadSuccess: (fileName?: string) => MockApiResponse<{
            id: `${string}-${string}-${string}-${string}-${string}`;
            fileName: string;
            fileSize: number;
            url: string;
            uploadedAt: string;
        }>;
        uploadError: (error?: string) => MockApiResponse<any>;
    };
};
/**
 * Mock HTTP response scenarios for different status codes
 */
export declare const mockHttpResponses: {
    /**
     * 2xx Success responses
     */
    success: {
        ok: <T>(data: T) => MockHttpResponse<T>;
        created: <T>(data: T) => MockHttpResponse<T>;
        accepted: <T>(data: T) => MockHttpResponse<T>;
        noContent: () => MockHttpResponse<null>;
    };
    /**
     * 4xx Client error responses
     */
    clientError: {
        badRequest: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        unauthorized: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        forbidden: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        notFound: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        conflict: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        unprocessableEntity: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        tooManyRequests: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
    };
    /**
     * 5xx Server error responses
     */
    serverError: {
        internalServerError: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        badGateway: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        serviceUnavailable: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
        gatewayTimeout: (message?: string) => MockHttpResponse<MockApiResponse<any>>;
    };
};
/**
 * Mock fetch function for testing HTTP requests
 */
export declare function createMockFetch(responses?: Record<string, MockHttpResponse>): {
    mockFetch: jest.Mock<Promise<Response>, [url: string | URL, options?: RequestInit | undefined], any>;
    /**
     * Add a mock response for a specific URL and method
     */
    addMockResponse: (url: string, response: MockHttpResponse, method?: string) => void;
    /**
     * Clear all mock responses
     */
    clearMockResponses: () => void;
    /**
     * Get call history
     */
    getCallHistory: () => [url: string | URL, options?: RequestInit | undefined][];
    /**
     * Reset call history
     */
    resetCallHistory: () => jest.Mock<Promise<Response>, [url: string | URL, options?: RequestInit | undefined], any>;
};
/**
 * API error scenarios for comprehensive testing
 */
export declare const apiErrorScenarios: {
    /**
     * Network connectivity errors
     */
    network: {
        connectionRefused: () => MockApiResponse<any>;
        timeout: () => MockApiResponse<any>;
        networkError: () => MockApiResponse<any>;
    };
    /**
     * Authentication errors
     */
    auth: {
        invalidToken: () => MockApiResponse<any>;
        expiredToken: () => MockApiResponse<any>;
        insufficientPermissions: () => MockApiResponse<any>;
    };
    /**
     * Validation errors
     */
    validation: {
        missingFields: (fields: string[]) => MockApiResponse<any>;
        invalidFormat: (field: string) => MockApiResponse<any>;
        valueTooLong: (field: string, maxLength: number) => MockApiResponse<any>;
    };
    /**
     * Business logic errors
     */
    business: {
        duplicateEntry: (resource: string) => MockApiResponse<any>;
        resourceNotFound: (resource: string) => MockApiResponse<any>;
        operationNotAllowed: (operation: string) => MockApiResponse<any>;
    };
    /**
     * Rate limiting errors
     */
    rateLimit: {
        tooManyRequests: () => MockApiResponse<any>;
        quotaExceeded: () => MockApiResponse<any>;
    };
};
/**
 * Mock API client for testing
 */
export declare class MockApiClient {
    private baseUrl;
    private defaultHeaders;
    private mockResponses;
    constructor(baseUrl?: string, defaultHeaders?: Record<string, string>);
    /**
     * Set mock response for an endpoint
     */
    setMockResponse(method: string, path: string, response: MockHttpResponse): void;
    /**
     * Mock GET request
     */
    get<T>(path: string, headers?: Record<string, string>): Promise<MockHttpResponse<T>>;
    /**
     * Mock POST request
     */
    post<T>(path: string, data?: any, headers?: Record<string, string>): Promise<MockHttpResponse<T>>;
    /**
     * Mock PUT request
     */
    put<T>(path: string, data?: any, headers?: Record<string, string>): Promise<MockHttpResponse<T>>;
    /**
     * Mock DELETE request
     */
    delete<T>(path: string, headers?: Record<string, string>): Promise<MockHttpResponse<T>>;
    /**
     * Clear all mock responses
     */
    clearMockResponses(): void;
}
//# sourceMappingURL=api-mocks.d.ts.map