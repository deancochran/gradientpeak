import { useCallback, useEffect, useState } from "react";

import { ActivityService } from "@lib/services/activity-service";

export interface UseAdvancedActivityRecorderReturn {
  // Recording state
  isRecording: boolean;
  isPaused: boolean;
  currentSession: RecordingSession | null;

  // Live metrics from current session
  duration: number;
  distance: number;
  currentSpeed: number;
  avgPace: string;
  currentHeartRate?: number;
  avgHeartRate?: number;
  currentPower?: number;
  avgPower?: number;
  calories?: number;
  elevation?: number;

  // Recording controls
  startActivity: (profileId: string) => Promise<boolean>;
  pauseActivity: () => Promise<boolean>;
  resumeActivity: () => Promise<boolean>;
  stopActivity: () => Promise<void>;

  // Sensor data
  addSensorData: (data: any) => void;

  // Error state
  error: string | null;
  clearError: () => void;
}

export const useAdvancedActivityRecorder =
  (): UseAdvancedActivityRecorderReturn => {
    // State
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentSession, setCurrentSession] =
      useState<RecordingSession | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Live metrics state
    const [duration, setDuration] = useState(0);
    const [distance, setDistance] = useState(0);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [avgPace, setAvgPace] = useState("--:--");
    const [currentHeartRate, setCurrentHeartRate] = useState<
      number | undefined
    >();
    const [avgHeartRate, setAvgHeartRate] = useState<number | undefined>();
    const [currentPower, setCurrentPower] = useState<number | undefined>();
    const [avgPower, setAvgPower] = useState<number | undefined>();
    const [calories, setCalories] = useState<number | undefined>();
    const [elevation, setElevation] = useState<number | undefined>();

    // Initialize service on mount
    useEffect(() => {
      ActivityService.initialize().catch((err) => {
        setError("Failed to initialize activity service");
        console.error(err);
      });
    }, []);

    // Poll current session and update state
    useEffect(() => {
      const pollSession = () => {
        const session = ActivityService.getCurrentSession();
        setCurrentSession(session);

        if (session) {
          setIsRecording(session.status === "recording");
          setIsPaused(session.status === "paused");

          // Update live metrics from session
          const metrics = session.liveMetrics;
          setDuration(metrics.duration || 0);
          setDistance(metrics.distance || 0);
          setCurrentSpeed(metrics.currentSpeed || 0);
          setCurrentHeartRate(metrics.currentHeartRate);
          setAvgHeartRate(metrics.avgHeartRate);
          setCurrentPower(metrics.currentPower);
          setAvgPower(metrics.avgPower);
          setCalories(metrics.calories);
          setElevation(metrics.elevation);

          // Calculate average pace
          if (
            metrics.distance &&
            metrics.duration &&
            metrics.distance > 0 &&
            metrics.duration > 0
          ) {
            const avgSpeedMs = metrics.distance / metrics.duration;
            setAvgPace(ActivityService.formatPace(avgSpeedMs));
          } else {
            setAvgPace("--:--");
          }
        } else {
          setIsRecording(false);
          setIsPaused(false);

          // Reset metrics
          setDuration(0);
          setDistance(0);
          setCurrentSpeed(0);
          setAvgPace("--:--");
          setCurrentHeartRate(undefined);
          setAvgHeartRate(undefined);
          setCurrentPower(undefined);
          setAvgPower(undefined);
          setCalories(undefined);
          setElevation(undefined);
        }
      };

      // Poll immediately
      pollSession();

      // Set up polling interval
      const interval = setInterval(pollSession, 1000);

      return () => clearInterval(interval);
    }, []);

    // Recording controls
    const startActivity = useCallback(
      async (profileId: string): Promise<boolean> => {
        try {
          setError(null);
          const sessionId = await ActivityService.startActivity(profileId);

          if (sessionId) {
            console.log(`Activity started: ${sessionId}`);
            return true;
          } else {
            setError("Failed to start activity");
            return false;
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(`Error starting activity: ${errorMessage}`);
          return false;
        }
      },
      [],
    );

    const pauseActivity = useCallback(async (): Promise<boolean> => {
      try {
        setError(null);
        const success = await ActivityService.pauseActivity();

        if (!success) {
          setError("Failed to pause activity");
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Error pausing activity: ${errorMessage}`);
        return false;
      }
    }, []);

    const resumeActivity = useCallback(async (): Promise<boolean> => {
      try {
        setError(null);
        const success = await ActivityService.resumeActivity();

        if (!success) {
          setError("Failed to resume activity");
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Error resuming activity: ${errorMessage}`);
        return false;
      }
    }, []);

    const stopActivity = useCallback(async (): Promise<void> => {
      try {
        setError(null);
        await ActivityService.stopActivity();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Error stopping activity: ${errorMessage}`);
      }
    }, []);

    const addSensorData = useCallback((data: any): void => {
      try {
        ActivityService.addSensorData(data);
      } catch (err) {
        console.warn("Error adding sensor data:", err);
      }
    }, []);

    const clearError = useCallback(() => {
      setError(null);
    }, []);

    return {
      // Recording state
      isRecording,
      isPaused,
      currentSession,

      // Live metrics
      duration,
      distance,
      currentSpeed,
      avgPace,
      currentHeartRate,
      avgHeartRate,
      currentPower,
      avgPower,
      calories,
      elevation,

      // Recording controls
      startActivity,
      pauseActivity,
      resumeActivity,
      stopActivity,

      // Sensor data
      addSensorData,

      // Error handling
      error,
      clearError,
    };
  };
