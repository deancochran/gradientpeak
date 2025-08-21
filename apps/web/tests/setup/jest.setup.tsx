import '@testing-library/jest-dom';
import { validateTestConfig } from '@repo/testing-utils';

// Validate test configuration on setup
beforeAll(() => {
  try {
    validateTestConfig();
  } catch (error) {
    console.error('Test configuration validation failed:', error);
    process.exit(1);
  }
});

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  usePathname() {
    return '';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: jest.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'test-user-id',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
      firstName: 'Test',
      lastName: 'User',
    },
  })),
  useAuth: jest.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'test-user-id',
    getToken: jest.fn(() => Promise.resolve('mock-jwt-token')),
  })),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  SignIn: () => <div data-testid="clerk-sign-in">Sign In Component</div>,
  UserButton: () => <div data-testid="user-button">User Button</div>,
}));

// Increase timeout for integration tests
jest.setTimeout(30000);