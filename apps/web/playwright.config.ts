import { defineConfig, devices } from '@playwright/test';
import { testConfig, isCI, getTestTimeout } from '@repo/testing-utils';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env.test' });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: isCI() ? 3 : 1,
  /* Opt out of parallel tests on CI. */
  workers: isCI() ? 2 : undefined,
  /* Test timeout - device agnostic */
  timeout: getTestTimeout() * 2, // E2E tests need more time
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { 
      outputFolder: 'playwright-report',
      open: isCI() ? 'never' : 'on-failure'
    }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ...(isCI() ? [['github']] : [['list']]),
    ['blob', { outputDir: 'test-results/blob-report' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on first retry */
    video: 'retain-on-failure',
    
    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true,
    
    /* Default timeout for actions - device agnostic */
    actionTimeout: getTestTimeout(),
    
    /* Default navigation timeout - device agnostic */
    navigationTimeout: getTestTimeout(),
    
    /* Device-agnostic browser settings */
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    
    /* Consistent viewport for responsive testing */
    viewport: { width: 1280, height: 720 },
  },

  /* Configure global setup and teardown */
  globalSetup: require.resolve('./tests/setup/global-setup.ts'),
  globalTeardown: require.resolve('./tests/setup/global-teardown.ts'),

  /* Device-agnostic test projects for comprehensive coverage */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Desktop browsers - comprehensive coverage
    {
      name: 'chromium-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'firefox-desktop',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'webkit-desktop',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },

    // Tablet viewports - responsive testing
    {
      name: 'tablet-chrome',
      use: { 
        ...devices['iPad Pro'],
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },

    // Mobile viewports - comprehensive mobile testing
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },
    
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },

    // Small mobile devices - edge case testing
    {
      name: 'mobile-small',
      use: {
        ...devices['iPhone SE'],
        storageState: 'tests/storage-states/user.json',
      },
      dependencies: ['setup'],
    },

    // Authentication flow tests - no pre-auth state
    {
      name: 'auth-flow-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /.*auth.*\.spec\.ts/,
    },
    
    {
      name: 'auth-flow-mobile',
      use: { 
        ...devices['iPhone 12'],
      },
      testMatch: /.*auth.*\.spec\.ts/,
    },
    
    // High contrast and accessibility testing
    {
      name: 'accessibility',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        forcedColors: 'active',
        reducedMotion: 'reduce',
      },
      testMatch: /.*accessibility.*\.spec\.ts/,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});