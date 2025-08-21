import { authTestHelper, databaseTestHelper } from '@repo/testing-utils';

async function globalTeardown() {
  try {
    // Clean up test data
    await databaseTestHelper.cleanup();
    console.log('✅ Database cleanup completed');

    // Delete test user
    if (process.env.TEST_USER_CLERK_ID) {
      await authTestHelper.deleteTestUser(process.env.TEST_USER_CLERK_ID);
      console.log('✅ Test user deleted');
    }

  } catch (error) {
    console.warn('⚠️ Global teardown failed:', error);
  }
}

export default globalTeardown;