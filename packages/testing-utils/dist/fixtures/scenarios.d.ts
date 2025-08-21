import { TestUser, TestActivity } from '../types';
/**
 * Predefined test scenarios for comprehensive testing
 */
export interface TestScenario {
    name: string;
    description: string;
    users: TestUser[];
    activities: TestActivity[];
    expectedOutcomes: Record<string, any>;
}
/**
 * New user onboarding scenario
 */
export declare const newUserOnboardingScenario: () => TestScenario;
/**
 * Active user with multiple activities scenario
 */
export declare const activeUserScenario: () => TestScenario;
/**
 * Multi-user privacy scenario
 */
export declare const multiUserPrivacyScenario: () => TestScenario;
/**
 * Data synchronization scenario
 */
export declare const dataSyncScenario: () => TestScenario;
/**
 * Performance and load testing scenario
 */
export declare const performanceScenario: () => TestScenario;
/**
 * Error handling and recovery scenario
 */
export declare const errorHandlingScenario: () => TestScenario;
/**
 * Mobile app specific scenario
 */
export declare const mobileAppScenario: () => TestScenario;
/**
 * Achievement system scenario
 */
export declare const achievementSystemScenario: () => TestScenario;
/**
 * Device-agnostic authentication scenarios
 */
export interface AuthTestScenario {
    name: string;
    description: string;
    credentials: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
    };
    expectedOutcome: 'success' | 'failure';
    expectedError?: string;
    platform?: 'web' | 'mobile' | 'both';
    viewport?: 'mobile' | 'tablet' | 'desktop' | 'all';
    tags: string[];
}
/**
 * Comprehensive authentication test scenarios
 */
export declare const deviceAgnosticAuthScenarios: AuthTestScenario[];
/**
 * Cross-platform test scenarios
 */
export declare const crossPlatformAuthScenarios: {
    /**
     * Get scenarios by platform
     */
    getByPlatform: (platform: "web" | "mobile" | "both") => AuthTestScenario[];
    /**
     * Get scenarios by viewport
     */
    getByViewport: (viewport: "mobile" | "tablet" | "desktop" | "all") => AuthTestScenario[];
    /**
     * Get scenarios by tags
     */
    getByTags: (tags: string[]) => AuthTestScenario[];
    /**
     * Get smoke test scenarios
     */
    getSmokeTests: () => AuthTestScenario[];
    /**
     * Get security test scenarios
     */
    getSecurityTests: () => AuthTestScenario[];
    /**
     * Get responsive test scenarios
     */
    getResponsiveTests: () => AuthTestScenario[];
};
/**
 * Page object test scenarios
 */
export interface PageObjectScenario {
    name: string;
    description: string;
    pages: string[];
    interactions: {
        action: string;
        target: string;
        data?: any;
        expectedResult?: string;
    }[];
    platform: 'web' | 'mobile' | 'both';
    tags: string[];
}
export declare const pageObjectAuthScenarios: PageObjectScenario[];
/**
 * Export all scenarios as a collection
 */
export declare const allTestScenarios: (() => TestScenario)[];
/**
 * Get scenario by name
 */
export declare const getScenarioByName: (name: string) => TestScenario | undefined;
/**
 * Get auth scenario by name
 */
export declare const getAuthScenarioByName: (name: string) => AuthTestScenario | undefined;
/**
 * Generate test data for auth scenarios
 */
export declare const generateAuthScenarioData: (scenario: AuthTestScenario) => {
    email: string;
    testId: string;
    timestamp: number;
    password: string;
    firstName?: string;
    lastName?: string;
};
//# sourceMappingURL=scenarios.d.ts.map