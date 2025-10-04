import { renderHook, act } from "@testing-library/react-native";
import { useActivityRecorderInit } from "../useActivityRecorderInit";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PublicProfilesRow } from "@supabase/supazod/schemas.types";

// Mock the ActivityRecorderService
jest.mock("@/lib/services/ActivityRecorder");
const MockActivityRecorderService = ActivityRecorderService as jest.MockedClass<
  typeof ActivityRecorderService
>;

// Mock the useAuth hook
jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

const mockProfile: PublicProfilesRow = {
  id: "test-profile-id",
  username: "testuser",
  full_name: "Test User",
  avatar_url: null,
  website: null,
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z",
};

describe("useActivityRecorderInit", () => {
  let mockCleanup: jest.Mock;
  let mockRemoveAllListeners: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCleanup = jest.fn().mockResolvedValue(undefined);
    mockRemoveAllListeners = jest.fn();

    MockActivityRecorderService.mockImplementation(
      () =>
        ({
          cleanup: mockCleanup,
          removeAllListeners: mockRemoveAllListeners,
          state: "pending",
          selectedActivityType: "indoor_bike_trainer",
          liveMetrics: new Map(),
        }) as any,
    );
  });

  it("should initialize with uninitialized state", () => {
    const { result } = renderHook(() => useActivityRecorderInit());

    expect(result.current.service).toBeNull();
    expect(result.current.serviceState).toBe("uninitialized");
    expect(result.current.isReady).toBe(false);
    expect(result.current.isUninitialized).toBe(true);
  });

  it("should create a new service instance", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());

    await act(async () => {
      const service = await result.current.createNewService(mockProfile);
      expect(service).toBeInstanceOf(ActivityRecorderService);
    });

    expect(result.current.service).toBeInstanceOf(ActivityRecorderService);
    expect(result.current.serviceState).toBe("active");
    expect(result.current.isReady).toBe(true);
    expect(MockActivityRecorderService).toHaveBeenCalledWith(mockProfile);
  });

  it("should cleanup existing service when creating new one", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());

    // Create first service
    await act(async () => {
      await result.current.createNewService(mockProfile);
    });

    const firstService = result.current.service;
    expect(firstService).toBeInstanceOf(ActivityRecorderService);

    // Create second service (should cleanup first)
    await act(async () => {
      await result.current.createNewService(mockProfile);
    });

    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(result.current.service).not.toBe(firstService);
    expect(result.current.service).toBeInstanceOf(ActivityRecorderService);
  });

  it("should mark service as completed", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());

    await act(async () => {
      await result.current.createNewService(mockProfile);
    });

    act(() => {
      result.current.markServiceCompleted();
    });

    expect(result.current.serviceState).toBe("completed");
    expect(result.current.isCompleted).toBe(true);
  });

  it("should cleanup service and reset state", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());

    await act(async () => {
      await result.current.createNewService(mockProfile);
    });

    expect(result.current.service).not.toBeNull();
    expect(result.current.serviceState).toBe("active");

    await act(async () => {
      await result.current.cleanupService();
    });

    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(result.current.service).toBeNull();
    expect(result.current.serviceState).toBe("uninitialized");
    expect(result.current.isReady).toBe(false);
  });

  it("should handle cleanup errors gracefully", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());
    const cleanupError = new Error("Cleanup failed");
    mockCleanup.mockRejectedValueOnce(cleanupError);

    // Mock console.error to avoid noise in tests
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    await act(async () => {
      await result.current.createNewService(mockProfile);
    });

    await act(async () => {
      await result.current.cleanupService();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[ServiceLifecycle] Error during service cleanup:",
      cleanupError,
    );
    expect(result.current.service).toBeNull();
    expect(result.current.serviceState).toBe("uninitialized");

    consoleSpy.mockRestore();
  });

  it("should handle service creation errors", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());
    const creationError = new Error("Service creation failed");
    MockActivityRecorderService.mockImplementationOnce(() => {
      throw creationError;
    });

    // Mock console.error to avoid noise in tests
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    await act(async () => {
      try {
        await result.current.createNewService(mockProfile);
      } catch (error) {
        expect(error).toBe(creationError);
      }
    });

    expect(result.current.service).toBeNull();
    expect(result.current.serviceState).toBe("uninitialized");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ServiceLifecycle] Failed to create new service instance:",
      creationError,
    );

    consoleSpy.mockRestore();
  });

  it("should provide correct lifecycle state flags", async () => {
    const { result } = renderHook(() => useActivityRecorderInit());

    // Uninitialized state
    expect(result.current.isUninitialized).toBe(true);
    expect(result.current.isReady).toBe(false);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isCleaningUp).toBe(false);

    // Create service - should be active/ready
    await act(async () => {
      await result.current.createNewService(mockProfile);
    });

    expect(result.current.isUninitialized).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isCleaningUp).toBe(false);

    // Mark completed
    act(() => {
      result.current.markServiceCompleted();
    });

    expect(result.current.isUninitialized).toBe(false);
    expect(result.current.isReady).toBe(false);
    expect(result.current.isCompleted).toBe(true);
    expect(result.current.isCleaningUp).toBe(false);

    // During cleanup, state should be 'cleanup' briefly
    await act(async () => {
      await result.current.cleanupService();
    });

    expect(result.current.isUninitialized).toBe(true);
    expect(result.current.isReady).toBe(false);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isCleaningUp).toBe(false);
  });
});
