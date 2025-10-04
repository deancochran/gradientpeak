import { renderHook, act } from "@testing-library/react-native";
import { useActivityRecorderInit } from "../useActivityRecorderInit";
import {
  useRecordingState,
  useActivityType,
  useRecordingActions,
} from "../useActivityRecorderEvents";
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

// Mock EventEmitter functionality
class MockEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off(event: string, listener: Function) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  emit(event: string, ...args: any[]) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(...args));
    }
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}

const mockProfile: PublicProfilesRow = {
  id: "test-profile-id",
  username: "testuser",
  full_name: "Test User",
  avatar_url: null,
  website: null,
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z",
};

describe("Service Lifecycle Integration", () => {
  let mockService: MockEventEmitter & {
    cleanup: jest.Mock;
    state: string;
    selectedActivityType: string;
    liveMetrics: Map<string, any>;
    startRecording: jest.Mock;
    pauseRecording: jest.Mock;
    resumeRecording: jest.Mock;
    finishRecording: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = Object.assign(new MockEventEmitter(), {
      cleanup: jest.fn().mockResolvedValue(undefined),
      state: "pending",
      selectedActivityType: "indoor_bike_trainer",
      liveMetrics: new Map(),
      startRecording: jest.fn().mockResolvedValue(undefined),
      pauseRecording: jest.fn().mockResolvedValue(undefined),
      resumeRecording: jest.fn().mockResolvedValue(undefined),
      finishRecording: jest.fn().mockResolvedValue(undefined),
    });

    MockActivityRecorderService.mockImplementation(() => mockService as any);
  });

  it("should complete full recording workflow with proper lifecycle management", async () => {
    // Initialize service lifecycle
    const { result: lifecycleResult } = renderHook(() =>
      useActivityRecorderInit(),
    );

    expect(lifecycleResult.current.serviceState).toBe("uninitialized");
    expect(lifecycleResult.current.service).toBeNull();

    // Create new service
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    expect(lifecycleResult.current.serviceState).toBe("active");
    expect(lifecycleResult.current.service).toBe(mockService);
    expect(lifecycleResult.current.isReady).toBe(true);

    // Initialize event-based hooks with the active service
    const { result: stateResult } = renderHook(() =>
      useRecordingState(lifecycleResult.current.service),
    );
    const { result: actionsResult } = renderHook(() =>
      useRecordingActions(lifecycleResult.current.service),
    );

    expect(stateResult.current).toBe("pending");

    // Simulate state changes during recording
    act(() => {
      mockService.state = "recording";
      mockService.emit("stateChange", "recording");
    });

    expect(stateResult.current).toBe("recording");

    // Test recording actions
    await act(async () => {
      await actionsResult.current.start?.();
    });

    expect(mockService.startRecording).toHaveBeenCalledTimes(1);

    // Simulate pause
    await act(async () => {
      await actionsResult.current.pause?.();
    });

    expect(mockService.pauseRecording).toHaveBeenCalledTimes(1);

    // Simulate resume
    await act(async () => {
      await actionsResult.current.resume?.();
    });

    expect(mockService.resumeRecording).toHaveBeenCalledTimes(1);

    // Finish recording
    await act(async () => {
      await actionsResult.current.finish?.();
    });

    expect(mockService.finishRecording).toHaveBeenCalledTimes(1);

    // Mark service as completed
    act(() => {
      lifecycleResult.current.markServiceCompleted();
    });

    expect(lifecycleResult.current.serviceState).toBe("completed");
    expect(lifecycleResult.current.isCompleted).toBe(true);

    // Cleanup service
    await act(async () => {
      await lifecycleResult.current.cleanupService();
    });

    expect(mockService.cleanup).toHaveBeenCalledTimes(1);
    expect(lifecycleResult.current.serviceState).toBe("uninitialized");
    expect(lifecycleResult.current.service).toBeNull();
    expect(lifecycleResult.current.isReady).toBe(false);
  });

  it("should handle multiple recording sessions with fresh service instances", async () => {
    const { result: lifecycleResult } = renderHook(() =>
      useActivityRecorderInit(),
    );

    // First recording session
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    const firstService = lifecycleResult.current.service;
    expect(firstService).toBe(mockService);
    expect(MockActivityRecorderService).toHaveBeenCalledTimes(1);

    // Complete first session
    act(() => {
      lifecycleResult.current.markServiceCompleted();
    });

    await act(async () => {
      await lifecycleResult.current.cleanupService();
    });

    expect(mockService.cleanup).toHaveBeenCalledTimes(1);

    // Second recording session - should get fresh service instance
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    const secondService = lifecycleResult.current.service;
    expect(secondService).not.toBe(firstService);
    expect(MockActivityRecorderService).toHaveBeenCalledTimes(2);
    expect(lifecycleResult.current.serviceState).toBe("active");
    expect(lifecycleResult.current.isReady).toBe(true);
  });

  it("should handle event listener cleanup between service instances", async () => {
    const { result: lifecycleResult } = renderHook(() =>
      useActivityRecorderInit(),
    );

    // Create first service
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    const firstService = lifecycleResult.current.service;

    // Add some listeners through event hooks
    const { result: stateResult } = renderHook(() =>
      useRecordingState(firstService),
    );
    const { result: typeResult } = renderHook(() =>
      useActivityType(firstService),
    );

    // Simulate some state changes
    act(() => {
      mockService.state = "recording";
      mockService.emit("stateChange", "recording");
      mockService.emit("activityTypeChange", "outdoor_run");
    });

    expect(stateResult.current).toBe("recording");

    // Create new service (should cleanup first service)
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    // First service should have had cleanup called
    expect(mockService.cleanup).toHaveBeenCalledTimes(1);

    // New service should be active
    expect(lifecycleResult.current.serviceState).toBe("active");
    expect(lifecycleResult.current.service).not.toBe(firstService);
  });

  it("should gracefully handle service creation failures", async () => {
    const { result: lifecycleResult } = renderHook(() =>
      useActivityRecorderInit(),
    );

    const creationError = new Error("Service creation failed");
    MockActivityRecorderService.mockImplementationOnce(() => {
      throw creationError;
    });

    // Mock console.error to avoid noise in tests
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    // Attempt to create service
    await act(async () => {
      try {
        await lifecycleResult.current.createNewService(mockProfile);
      } catch (error) {
        expect(error).toBe(creationError);
      }
    });

    // Service should remain uninitialized
    expect(lifecycleResult.current.service).toBeNull();
    expect(lifecycleResult.current.serviceState).toBe("uninitialized");
    expect(lifecycleResult.current.isReady).toBe(false);

    // Should have logged the error
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ServiceLifecycle] Failed to create new service instance:",
      creationError,
    );

    consoleSpy.mockRestore();
  });

  it("should handle cleanup failures gracefully", async () => {
    const { result: lifecycleResult } = renderHook(() =>
      useActivityRecorderInit(),
    );

    // Create service
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    expect(lifecycleResult.current.service).toBe(mockService);

    // Make cleanup fail
    const cleanupError = new Error("Cleanup failed");
    mockService.cleanup.mockRejectedValueOnce(cleanupError);

    // Mock console.error to avoid noise in tests
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    // Attempt cleanup
    await act(async () => {
      await lifecycleResult.current.cleanupService();
    });

    // Service should still be cleaned up despite error
    expect(lifecycleResult.current.service).toBeNull();
    expect(lifecycleResult.current.serviceState).toBe("uninitialized");

    // Should have logged the error
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ServiceLifecycle] Error during service cleanup:",
      cleanupError,
    );

    consoleSpy.mockRestore();
  });

  it("should prevent memory leaks by ensuring event listeners are cleaned up", async () => {
    const { result: lifecycleResult } = renderHook(() =>
      useActivityRecorderInit(),
    );

    // Create service
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    const service = lifecycleResult.current.service as any;

    // Create multiple event hooks that add listeners
    const stateHook = renderHook(() => useRecordingState(service));
    const typeHook = renderHook(() => useActivityType(service));

    // Verify listeners were added
    expect(service.listeners.get("stateChange")).toHaveLength(1);
    expect(service.listeners.get("activityTypeChange")).toHaveLength(1);

    // Cleanup service
    await act(async () => {
      await lifecycleResult.current.cleanupService();
    });

    // Cleanup should have been called
    expect(mockService.cleanup).toHaveBeenCalledTimes(1);

    // Unmount the hooks to trigger listener cleanup
    stateHook.unmount();
    typeHook.unmount();

    // Create new service to verify fresh state
    await act(async () => {
      await lifecycleResult.current.createNewService(mockProfile);
    });

    // New service should start with no listeners
    const newService = lifecycleResult.current.service as any;
    expect(newService.listeners.size).toBe(0);
  });
});
