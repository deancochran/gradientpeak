import { Page } from '@playwright/test';
/**
 * Device-agnostic test utilities that work across all platforms and environments
 */
export interface DeviceAgnosticSelector {
    /** Primary selector (usually data-testid) */
    primary: string;
    /** Fallback selectors in order of preference */
    fallbacks: string[];
    /** Text-based selector as last resort */
    text?: string;
    /** ARIA label selector */
    ariaLabel?: string;
}
export interface ResponsiveBreakpoints {
    mobile: {
        width: number;
        height: number;
    };
    tablet: {
        width: number;
        height: number;
    };
    desktop: {
        width: number;
        height: number;
    };
    ultraWide: {
        width: number;
        height: number;
    };
}
export declare const standardBreakpoints: ResponsiveBreakpoints;
/**
 * Device-agnostic page object base class
 */
export declare class DeviceAgnosticPage {
    protected page: Page;
    constructor(page: Page);
    /**
     * Find element using device-agnostic selector strategy
     */
    findElement(selector: DeviceAgnosticSelector): Promise<import("@playwright/test").Locator>;
    /**
     * Wait for page load with device-agnostic approach
     */
    waitForPageLoad(timeout?: number): Promise<void>;
    /**
     * Handle responsive layout changes
     */
    setViewportSize(breakpoint: keyof ResponsiveBreakpoints): Promise<void>;
    /**
     * Take screenshot with device context
     */
    takeScreenshot(name: string): Promise<void>;
    /**
     * Check if element is interactive (clickable, focusable)
     */
    isElementInteractive(selector: DeviceAgnosticSelector): Promise<boolean>;
    /**
     * Scroll element into view with device-agnostic approach
     */
    scrollToElement(selector: DeviceAgnosticSelector): Promise<void>;
}
/**
 * Authentication-specific page object
 */
export declare class AuthPage extends DeviceAgnosticPage {
    private readonly selectors;
    signIn(email: string, password: string): Promise<void>;
    signUp(userData: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
    }): Promise<void>;
    waitForError(expectedMessage?: string, timeout?: number): Promise<import("@playwright/test").Locator>;
    waitForSuccess(timeout?: number): Promise<import("@playwright/test").Locator>;
    waitForLoading(shouldBeVisible?: boolean, timeout?: number): Promise<void>;
    /**
     * Test form validation with device-agnostic approach
     */
    testFormValidation(field: 'email' | 'password' | 'firstName' | 'lastName', invalidValue: string): Promise<string | null>;
}
/**
 * Utility functions for device-agnostic testing
 */
export declare const deviceAgnosticTestUtils: {
    /**
     * Generate test data based on environment
     */
    generateTestUserData: (overrides?: Partial<any>) => {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    };
    /**
     * Get appropriate timeout for current environment
     */
    getTimeout: (baseTimeout?: number) => number;
    /**
     * Retry operation with exponential backoff
     */
    retryWithBackoff: <T>(operation: () => Promise<T>, maxRetries?: number, baseDelay?: number) => Promise<T>;
    /**
     * Check if current platform supports certain features
     */
    platformSupports: {
        touchEvents: () => boolean;
        biometrics: () => boolean;
        notifications: () => boolean;
        geolocation: () => boolean;
    };
    /**
     * Mock platform-specific APIs for testing
     */
    mockPlatformAPIs: (page: Page) => {
        mockGeolocation: (coords: {
            latitude: number;
            longitude: number;
        }) => Promise<void>;
        mockNotifications: () => Promise<void>;
    };
};
//# sourceMappingURL=device-agnostic.d.ts.map