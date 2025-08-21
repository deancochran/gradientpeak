/**
 * Error scenario generation helpers for comprehensive testing
 * These utilities provide realistic error conditions and edge cases
 * to ensure robust error handling in the application.
 */
/**
 * Common error types in the application
 */
export type ErrorType = 'authentication' | 'authorization' | 'validation' | 'network' | 'database' | 'business-logic' | 'rate-limit' | 'server' | 'external-service';
/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
/**
 * Comprehensive error scenario structure
 */
export interface ErrorScenario {
    /** Unique identifier for the scenario */
    id: string;
    /** Human-readable name */
    name: string;
    /** Error type category */
    type: ErrorType;
    /** Severity level */
    severity: ErrorSeverity;
    /** HTTP status code (if applicable) */
    statusCode?: number;
    /** Error message */
    message: string;
    /** Error code for programmatic handling */
    errorCode?: string;
    /** Additional error details */
    details?: Record<string, any>;
    /** Expected user-facing message */
    userMessage?: string;
    /** Recovery suggestions */
    recovery?: string[];
    /** Whether error should be retryable */
    retryable: boolean;
    /** Mock error object */
    error: Error;
    /** Mock API response (if applicable) */
    apiResponse?: any;
    /** Mock HTTP response (if applicable) */
    httpResponse?: any;
}
/**
 * Generate authentication error scenarios
 */
export declare function generateAuthErrorScenarios(): ErrorScenario[];
/**
 * Generate validation error scenarios
 */
export declare function generateValidationErrorScenarios(): ErrorScenario[];
/**
 * Generate network error scenarios
 */
export declare function generateNetworkErrorScenarios(): ErrorScenario[];
/**
 * Generate database error scenarios
 */
export declare function generateDatabaseErrorScenarios(): ErrorScenario[];
/**
 * Generate business logic error scenarios
 */
export declare function generateBusinessLogicErrorScenarios(): ErrorScenario[];
/**
 * Generate rate limit error scenarios
 */
export declare function generateRateLimitErrorScenarios(): ErrorScenario[];
/**
 * Generate server error scenarios
 */
export declare function generateServerErrorScenarios(): ErrorScenario[];
/**
 * Generate external service error scenarios
 */
export declare function generateExternalServiceErrorScenarios(): ErrorScenario[];
/**
 * Comprehensive error scenario collections
 */
export declare const errorScenarios: {
    auth: ErrorScenario[];
    validation: ErrorScenario[];
    network: ErrorScenario[];
    database: ErrorScenario[];
    businessLogic: ErrorScenario[];
    rateLimit: ErrorScenario[];
    server: ErrorScenario[];
    externalService: ErrorScenario[];
};
/**
 * Get all error scenarios
 */
export declare function getAllErrorScenarios(): ErrorScenario[];
/**
 * Get error scenarios by type
 */
export declare function getErrorScenariosByType(type: ErrorType): ErrorScenario[];
/**
 * Get error scenarios by severity
 */
export declare function getErrorScenariosBySeverity(severity: ErrorSeverity): ErrorScenario[];
/**
 * Get retryable error scenarios
 */
export declare function getRetryableErrorScenarios(): ErrorScenario[];
/**
 * Get random error scenario
 */
export declare function getRandomErrorScenario(filters?: {
    type?: ErrorType;
    severity?: ErrorSeverity;
    retryable?: boolean;
}): ErrorScenario;
/**
 * Error simulation utilities
 */
export declare const errorSimulation: {
    /**
     * Simulate network failure
     */
    simulateNetworkFailure: (type?: "timeout" | "connection" | "dns") => Error;
    /**
     * Simulate authentication failure
     */
    simulateAuthFailure: (type?: "invalid-credentials" | "expired-token" | "locked") => Error;
    /**
     * Simulate validation failure
     */
    simulateValidationFailure: (type?: "missing-fields" | "invalid-format" | "weak-password") => Error;
    /**
     * Simulate random error with specified probability
     */
    simulateRandomError: (probability?: number, filters?: Parameters<typeof getRandomErrorScenario>[0]) => void;
};
/**
 * Error testing utilities
 */
export declare const errorTestUtils: {
    /**
     * Test error handling for a function
     */
    testErrorHandling<T>(fn: () => Promise<T>, expectedErrorScenario: ErrorScenario): Promise<{
        handled: boolean;
        actualError?: any;
    }>;
    /**
     * Assert that function throws expected error
     */
    assertThrowsErrorScenario<T>(fn: () => Promise<T>, expectedScenario: ErrorScenario): Promise<void>;
    /**
     * Create error boundary test component (for React testing)
     */
    createErrorBoundaryTest: (expectedError: ErrorScenario) => {
        error: Error;
        expectedMessage: string;
        expectedRecovery: string[] | undefined;
    };
};
//# sourceMappingURL=error-scenarios.d.ts.map