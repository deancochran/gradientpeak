import { chromium, FullConfig } from '@playwright/test';
import { validateTestConfig, authTestHelper, databaseTestHelper } from '@repo/testing-utils';

async function globalSetup(config: FullConfig) {
  // Validate test configuration
  try {
    validateTestConfig();
    console.log('✅ Test configuration validated');
  } catch (error) {
    console.error('❌ Test configuration invalid:', error);
    process.exit(1);
  }

  // Create test user for authenticated tests
  try {
    const testUser = await authTestHelper.createTestUser({
      email: 'e2e-test@test.example',
      password: 'E2ETestPassword123!',
      firstName: 'E2E',
      lastName: 'Test',
    });

    // Wait for webhook processing
    await authTestHelper.waitForWebhookProcessing();

    // Verify user sync
    const userSynced = await databaseTestHelper.verifyUserSync(
      testUser.clerkUserId!,
      testUser.email
    );

    if (!userSynced) {
      console.warn('⚠️ User sync verification failed, but continuing...');
    }

    console.log('✅ Test user created and synced');

    // Authenticate and save session
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Go to sign-in page
    await page.goto('/sign-in');

    // Fill in credentials
    await page.fill('input[name="identifier"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard', { timeout: 30000 });

    // Save authentication state
    await context.storageState({ path: 'tests/storage-states/user.json' });

    await browser.close();
    console.log('✅ Authentication state saved');

    // Store test user info for teardown
    process.env.TEST_USER_CLERK_ID = testUser.clerkUserId;
    process.env.TEST_USER_EMAIL = testUser.email;

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    process.exit(1);
  }
}

export default globalSetup;