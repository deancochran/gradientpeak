import { useCallback, useEffect, useState } from "react";

import { WorkoutService } from "@lib/services/workout-service";

export interface UseAdvancedWorkoutRecorderReturn {
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
  startWorkout: (profileId: string) => Promise<boolean>;
  pauseWorkout: () => Promise<boolean>;
  resumeWorkout: () => Promise<boolean>;
  stopWorkout: () => Promise<void>;

  // Sensor data
  addSensorData: (data: any) => void;

  // Error state
  error: string | null;
  clearError: () => void;
}

export const useAdvancedWorkoutRecorder =
  (): UseAdvancedWorkoutRecorderReturn => {
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
      WorkoutService.initialize().catch((err) => {
        setError("Failed to initialize workout service");
        console.error(err);
      });
    }, []);

    // Poll current session and update state
    useEffect(() => {
      const pollSession = () => {
        const session = WorkoutService.getCurrentSession();
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
            setAvgPace(WorkoutService.formatPace(avgSpeedMs));
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
    const startWorkout = useCallback(
      async (profileId: string): Promise<boolean> => {
        try {
          setError(null);
          const sessionId = await WorkoutService.startWorkout(profileId);

          if (sessionId) {
            console.log(`Workout started: ${sessionId}`);
            return true;
          } else {
            setError("Failed to start workout");
            return false;
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(`Error starting workout: ${errorMessage}`);
          return false;
        }
      },
      [],
    );

    const pauseWorkout = useCallback(async (): Promise<boolean> => {
      try {
        setError(null);
        const success = await WorkoutService.pauseWorkout();

        if (!success) {
          setError("Failed to pause workout");
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Error pausing workout: ${errorMessage}`);
        return false;
      }
    }, []);

    const resumeWorkout = useCallback(async (): Promise<boolean> => {
      try {
        setError(null);
        const success = await WorkoutService.resumeWorkout();

        if (!success) {
          setError("Failed to resume workout");
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Error resuming workout: ${errorMessage}`);
        return false;
      }
    }, []);

    const stopWorkout = useCallback(async (): Promise<void> => {
      try {
        setError(null);
        await WorkoutService.stopWorkout();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Error stopping workout: ${errorMessage}`);
      }
    }, []);

    const addSensorData = useCallback((data: any): void => {
      try {
        WorkoutService.addSensorData(data);
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
      startWorkout,
      pauseWorkout,
      resumeWorkout,
      stopWorkout,

      // Sensor data
      addSensorData,

      // Error handling
      error,
      clearError,
    };
  };
