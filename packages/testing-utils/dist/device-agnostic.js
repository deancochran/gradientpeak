"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceAgnosticTestUtils = exports.AuthPage = exports.DeviceAgnosticPage = exports.standardBreakpoints = void 0;
const config_1 = require("./config");
exports.standardBreakpoints = {
    mobile: { width: 375, height: 667 }, // iPhone SE
    tablet: { width: 768, height: 1024 }, // iPad
    desktop: { width: 1280, height: 720 }, // Standard desktop
    ultraWide: { width: 1920, height: 1080 } // Full HD
};
/**
 * Device-agnostic page object base class
 */
class DeviceAgnosticPage {
    page;
    constructor(page) {
        this.page = page;
    }
    /**
     * Find element using device-agnostic selector strategy
     */
    async findElement(selector) {
        // Try primary selector first (usually data-testid)
        try {
            const element = this.page.locator(`[data-testid="${selector.primary}"]`);
            if (await element.isVisible({ timeout: 1000 })) {
                return element;
            }
        }
        catch {
            // Continue to fallbacks
        }
        // Try fallback selectors
        for (const fallback of selector.fallbacks) {
            try {
                const element = this.page.locator(fallback);
                if (await element.isVisible({ timeout: 1000 })) {
                    return element;
                }
            }
            catch {
                // Continue to next fallback
            }
        }
        // Try ARIA label
        if (selector.ariaLabel) {
            try {
                const element = this.page.getByRole('button', { name: selector.ariaLabel });
                if (await element.isVisible({ timeout: 1000 })) {
                    return element;
                }
            }
            catch {
                // Continue to text selector
            }
        }
        // Try text selector as last resort
        if (selector.text) {
            const element = this.page.getByText(selector.text);
            return element;
        }
        // If all else fails, use primary selector and let it fail with proper error
        return this.page.locator(`[data-testid="${selector.primary}"]`);
    }
    /**
     * Wait for page load with device-agnostic approach
     */
    async waitForPageLoad(timeout) {
        const waitTimeout = timeout || ((0, config_1.isCI)() ? 30000 : 15000);
        await Promise.all([
            this.page.waitForLoadState('networkidle', { timeout: waitTimeout }),
            this.page.waitForLoadState('domcontentloaded', { timeout: waitTimeout })
        ]);
    }
    /**
     * Handle responsive layout changes
     */
    async setViewportSize(breakpoint) {
        const size = exports.standardBreakpoints[breakpoint];
        await this.page.setViewportSize(size);
        // Wait for responsive layout to settle
        await this.page.waitForTimeout(500);
    }
    /**
     * Take screenshot with device context
     */
    async takeScreenshot(name) {
        const viewport = this.page.viewportSize();
        const deviceContext = viewport ?
            `${viewport.width}x${viewport.height}` :
            'default';
        await this.page.screenshot({
            path: `screenshots/${name}-${deviceContext}.png`,
            fullPage: true
        });
    }
    /**
     * Check if element is interactive (clickable, focusable)
     */
    async isElementInteractive(selector) {
        const element = await this.findElement(selector);
        try {
            await element.hover({ timeout: 1000 });
            return await element.isEnabled();
        }
        catch {
            return false;
        }
    }
    /**
     * Scroll element into view with device-agnostic approach
     */
    async scrollToElement(selector) {
        const element = await this.findElement(selector);
        await element.scrollIntoViewIfNeeded();
        // Wait for scroll animation to complete
        await this.page.waitForTimeout(300);
    }
}
exports.DeviceAgnosticPage = DeviceAgnosticPage;
/**
 * Authentication-specific page object
 */
class AuthPage extends DeviceAgnosticPage {
    // Device-agnostic selectors for auth elements
    selectors = {
        signInButton: {
            primary: 'sign-in-button',
            fallbacks: ['button[type="submit"]', '.sign-in-btn'],
            text: 'Sign In',
            ariaLabel: 'Sign in to your account'
        },
        signUpButton: {
            primary: 'sign-up-button',
            fallbacks: ['.sign-up-btn', 'button[type="submit"]'],
            text: 'Sign Up',
            ariaLabel: 'Create new account'
        },
        emailInput: {
            primary: 'email-input',
            fallbacks: ['input[type="email"]', 'input[name="email"]', '#email'],
            ariaLabel: 'Email address'
        },
        passwordInput: {
            primary: 'password-input',
            fallbacks: ['input[type="password"]', 'input[name="password"]', '#password'],
            ariaLabel: 'Password'
        },
        firstNameInput: {
            primary: 'first-name-input',
            fallbacks: ['input[name="firstName"]', '#firstName'],
            ariaLabel: 'First name'
        },
        lastNameInput: {
            primary: 'last-name-input',
            fallbacks: ['input[name="lastName"]', '#lastName'],
            ariaLabel: 'Last name'
        },
        errorMessage: {
            primary: 'error-message',
            fallbacks: ['.error', '.alert-error', '[role="alert"]'],
            ariaLabel: 'Error message'
        },
        successMessage: {
            primary: 'success-message',
            fallbacks: ['.success', '.alert-success'],
            ariaLabel: 'Success message'
        },
        loadingSpinner: {
            primary: 'loading-spinner',
            fallbacks: ['.loading', '.spinner', '[aria-label="Loading"]'],
            ariaLabel: 'Loading'
        }
    };
    async signIn(email, password) {
        // Fill email field
        const emailInput = await this.findElement(this.selectors.emailInput);
        await emailInput.fill(email);
        // Fill password field
        const passwordInput = await this.findElement(this.selectors.passwordInput);
        await passwordInput.fill(password);
        // Submit form
        const signInButton = await this.findElement(this.selectors.signInButton);
        await signInButton.click();
        // Wait for navigation or error
        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
    }
    async signUp(userData) {
        // Fill first name if provided
        if (userData.firstName) {
            const firstNameInput = await this.findElement(this.selectors.firstNameInput);
            await firstNameInput.fill(userData.firstName);
        }
        // Fill last name if provided
        if (userData.lastName) {
            const lastNameInput = await this.findElement(this.selectors.lastNameInput);
            await lastNameInput.fill(userData.lastName);
        }
        // Fill email
        const emailInput = await this.findElement(this.selectors.emailInput);
        await emailInput.fill(userData.email);
        // Fill password
        const passwordInput = await this.findElement(this.selectors.passwordInput);
        await passwordInput.fill(userData.password);
        // Submit form
        const signUpButton = await this.findElement(this.selectors.signUpButton);
        await signUpButton.click();
        // Wait for navigation or error
        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
    }
    async waitForError(expectedMessage, timeout) {
        const errorElement = await this.findElement(this.selectors.errorMessage);
        await errorElement.waitFor({
            state: 'visible',
            timeout: timeout || 10000
        });
        if (expectedMessage) {
            const actualMessage = await errorElement.textContent();
            if (!actualMessage?.includes(expectedMessage)) {
                throw new Error(`Expected error "${expectedMessage}" but got "${actualMessage}"`);
            }
        }
        return errorElement;
    }
    async waitForSuccess(timeout) {
        const successElement = await this.findElement(this.selectors.successMessage);
        await successElement.waitFor({
            state: 'visible',
            timeout: timeout || 10000
        });
        return successElement;
    }
    async waitForLoading(shouldBeVisible = true, timeout) {
        const loadingElement = await this.findElement(this.selectors.loadingSpinner);
        if (shouldBeVisible) {
            await loadingElement.waitFor({
                state: 'visible',
                timeout: timeout || 5000
            });
        }
        else {
            await loadingElement.waitFor({
                state: 'hidden',
                timeout: timeout || 30000
            });
        }
    }
    /**
     * Test form validation with device-agnostic approach
     */
    async testFormValidation(field, invalidValue) {
        const selectorMap = {
            email: this.selectors.emailInput,
            password: this.selectors.passwordInput,
            firstName: this.selectors.firstNameInput,
            lastName: this.selectors.lastNameInput
        };
        const fieldInput = await this.findElement(selectorMap[field]);
        await fieldInput.fill(invalidValue);
        await fieldInput.blur();
        // Wait for validation error to appear
        await this.page.waitForTimeout(500);
        // Check for field-specific error or general error message
        try {
            const fieldError = this.page.locator(`[data-testid="${field}-error"]`);
            if (await fieldError.isVisible()) {
                return await fieldError.textContent();
            }
        }
        catch {
            // Fall back to general error message
        }
        const generalError = await this.findElement(this.selectors.errorMessage);
        return await generalError.textContent();
    }
}
exports.AuthPage = AuthPage;
/**
 * Utility functions for device-agnostic testing
 */
exports.deviceAgnosticTestUtils = {
    /**
     * Generate test data based on environment
     */
    generateTestUserData: (overrides = {}) => ({
        email: `test+${Date.now()}@turbofit.dev`,
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        ...overrides
    }),
    /**
     * Get appropriate timeout for current environment
     */
    getTimeout: (baseTimeout = 10000) => {
        const multiplier = (0, config_1.isCI)() ? 3 : 1;
        return baseTimeout * multiplier;
    },
    /**
     * Retry operation with exponential backoff
     */
    retryWithBackoff: async (operation, maxRetries = 3, baseDelay = 1000) => {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    throw lastError;
                }
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    },
    /**
     * Check if current platform supports certain features
     */
    platformSupports: {
        touchEvents: () => typeof window !== 'undefined' && 'ontouchstart' in window,
        biometrics: () => typeof window !== 'undefined' && 'PublicKeyCredential' in window,
        notifications: () => typeof window !== 'undefined' && 'Notification' in window,
        geolocation: () => typeof window !== 'undefined' && 'geolocation' in navigator,
    },
    /**
     * Mock platform-specific APIs for testing
     */
    mockPlatformAPIs: (page) => ({
        mockGeolocation: async (coords) => {
            await page.addInitScript((coords) => {
                Object.defineProperty(navigator, 'geolocation', {
                    value: {
                        getCurrentPosition: (success) => {
                            success({
                                coords: {
                                    latitude: coords.latitude,
                                    longitude: coords.longitude,
                                    accuracy: 1
                                }
                            });
                        }
                    }
                });
            }, coords);
        },
        mockNotifications: async () => {
            await page.addInitScript(() => {
                Object.defineProperty(window, 'Notification', {
                    value: {
                        permission: 'granted',
                        requestPermission: () => Promise.resolve('granted')
                    }
                });
            });
        }
    })
};
