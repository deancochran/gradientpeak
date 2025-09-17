import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PlannedActivity {
  id: string;
  name: string;
  description?: string;
  activityType: "cycling" | "running" | "swimming" | "other";
  estimatedDuration: number; // seconds
  estimatedDistance?: number; // meters
  estimatedTSS?: number;
  steps: ActivityStep[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    difficulty: "easy" | "moderate" | "hard" | "very_hard";
    tags: string[];
  };
}

export interface ActivityStep {
  id: string;
  name: string;
  type: "warmup" | "interval" | "recovery" | "cooldown" | "free";
  duration?: number; // seconds
  distance?: number; // meters
  targetIntensity?: {
    type: "heartRate" | "power" | "pace" | "perceived";
    min?: number;
    max?: number;
    target?: number;
    unit: string;
  };
  instructions?: string;
  alerts?: StepAlert[];
  repeatCount?: number; // for interval sets
}

export interface StepAlert {
  type: "time" | "distance" | "heartRate" | "power" | "pace";
  trigger: {
    value: number;
    operator: "above" | "below" | "equals";
  };
  message: string;
  alertType: "audio" | "vibration" | "visual";
}

export interface PlannedActivitySession {
  id: string;
  plannedActivityId: string;
  recordingId?: string;
  startTime: string;
  endTime?: string;
  status: "not_started" | "in_progress" | "paused" | "completed" | "abandoned";
  currentStep: number;
  stepStartTime?: string;
  stepProgress: {
    duration: number;
    distance: number;
    completedSteps: number[];
    skippedSteps: number[];
  };
  metrics: {
    actualDuration: number;
    actualDistance: number;
    averageHeartRate?: number;
    averagePower?: number;
    compliance: number; // 0-100% how well they followed the plan
  };
}

const STORAGE_KEYS = {
  PLANNED_ACTIVITIES: "@planned_activities",
  ACTIVE_SESSION: "@active_planned_session",
  COMPLETED_SESSIONS: "@completed_planned_sessions",
  ACTIVITY_TEMPLATES: "@activity_templates",
};

class PlannedActivityService {
  /**
   * Get all planned activities
   */
  static async getAllPlannedActivities(): Promise<PlannedActivity[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PLANNED_ACTIVITIES);
      const activities = data ? JSON.parse(data) : {};
      return Object.values(activities).sort((a: any, b: any) =>
        new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
      );
    } catch (error) {
      console.error("Failed to get planned activities:", error);
      return [];
    }
  }

  /**
   * Get planned activity by ID
   */
  static async getPlannedActivity(id: string): Promise<PlannedActivity | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PLANNED_ACTIVITIES);
      const activities = data ? JSON.parse(data) : {};
      return activities[id] || null;
    } catch (error) {
      console.error("Failed to get planned activity:", error);
      return null;
    }
  }

  /**
   * Create a new planned activity
   */
  static async createPlannedActivity(
    name: string,
    activityType: PlannedActivity["activityType"],
    steps: Omit<ActivityStep, "id">[],
    profileId: string,
    options: {
      description?: string;
      difficulty?: PlannedActivity["metadata"]["difficulty"];
      tags?: string[];
    } = {}
  ): Promise<PlannedActivity> {
    const id = `planned_${Date.now()}`;
    const now = new Date().toISOString();

    // Generate step IDs and calculate estimates
    const processedSteps: ActivityStep[] = steps.map((step, index) => ({
      ...step,
      id: `step_${index + 1}`,
    }));

    const estimatedDuration = processedSteps.reduce((total, step) => {
      return total + (step.duration || 0);
    }, 0);

    const estimatedDistance = processedSteps.reduce((total, step) => {
      return total + (step.distance || 0);
    }, 0);

    const plannedActivity: PlannedActivity = {
      id,
      name,
      description: options.description,
      activityType,
      estimatedDuration,
      estimatedDistance: estimatedDistance > 0 ? estimatedDistance : undefined,
      steps: processedSteps,
      metadata: {
        createdAt: now,
        updatedAt: now,
        createdBy: profileId,
        difficulty: options.difficulty || "moderate",
        tags: options.tags || [],
      },
    };

    // Save to storage
    await this.savePlannedActivity(plannedActivity);

    console.log("✅ Created planned activity:", plannedActivity.name);
    return plannedActivity;
  }

  /**
   * Save planned activity to storage
   */
  private static async savePlannedActivity(activity: PlannedActivity): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PLANNED_ACTIVITIES);
      const activities = data ? JSON.parse(data) : {};
      activities[activity.id] = activity;
      await AsyncStorage.setItem(STORAGE_KEYS.PLANNED_ACTIVITIES, JSON.stringify(activities));
    } catch (error) {
      throw new Error(`Failed to save planned activity: ${error}`);
    }
  }

  /**
   * Start a planned activity session
   */
  static async startPlannedActivitySession(
    plannedActivityId: string,
    recordingId: string
  ): Promise<PlannedActivitySession> {
    const plannedActivity = await this.getPlannedActivity(plannedActivityId);
    if (!plannedActivity) {
      throw new Error("Planned activity not found");
    }

    // Check for existing active session
    const existingSession = await this.getActiveSession();
    if (existingSession && existingSession.status === "in_progress") {
      throw new Error("Another planned activity session is already in progress");
    }

    const session: PlannedActivitySession = {
      id: `session_${Date.now()}`,
      plannedActivityId,
      recordingId,
      startTime: new Date().toISOString(),
      status: "in_progress",
      currentStep: 0,
      stepStartTime: new Date().toISOString(),
      stepProgress: {
        duration: 0,
        distance: 0,
        completedSteps: [],
        skippedSteps: [],
      },
      metrics: {
        actualDuration: 0,
        actualDistance: 0,
        compliance: 0,
      },
    };

    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(session));
    console.log("🎯 Started planned activity session:", session.id);
    return session;
  }

  /**
   * Get active planned activity session
   */
  static async getActiveSession(): Promise<PlannedActivitySession | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Failed to get active session:", error);
      return null;
    }
  }

  /**
   * Update planned activity session
   */
  static async updateSession(session: PlannedActivitySession): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(session));
    } catch (error) {
      throw new Error(`Failed to update session: ${error}`);
    }
  }

  /**
   * Advance to next step in planned activity
   */
  static async advanceToNextStep(): Promise<{
    success: boolean;
    currentStep: number;
    isCompleted: boolean;
    stepInfo?: ActivityStep;
  }> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "in_progress") {
      return { success: false, currentStep: -1, isCompleted: false };
    }

    const plannedActivity = await this.getPlannedActivity(session.plannedActivityId);
    if (!plannedActivity) {
      return { success: false, currentStep: -1, isCompleted: false };
    }

    // Mark current step as completed
    session.stepProgress.completedSteps.push(session.currentStep);

    // Advance to next step
    session.currentStep += 1;
    session.stepStartTime = new Date().toISOString();

    const isCompleted = session.currentStep >= plannedActivity.steps.length;

    if (isCompleted) {
      session.status = "completed";
      session.endTime = new Date().toISOString();
      await this.completeSession(session);
    } else {
      await this.updateSession(session);
    }

    const stepInfo = !isCompleted ? plannedActivity.steps[session.currentStep] : undefined;

    return {
      success: true,
      currentStep: session.currentStep,
      isCompleted,
      stepInfo,
    };
  }

  /**
   * Skip current step
   */
  static async skipCurrentStep(): Promise<{
    success: boolean;
    currentStep: number;
    isCompleted: boolean;
    stepInfo?: ActivityStep;
  }> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "in_progress") {
      return { success: false, currentStep: -1, isCompleted: false };
    }

    const plannedActivity = await this.getPlannedActivity(session.plannedActivityId);
    if (!plannedActivity) {
      return { success: false, currentStep: -1, isCompleted: false };
    }

    // Mark current step as skipped
    session.stepProgress.skippedSteps.push(session.currentStep);

    // Advance to next step
    session.currentStep += 1;
    session.stepStartTime = new Date().toISOString();

    const isCompleted = session.currentStep >= plannedActivity.steps.length;

    if (isCompleted) {
      session.status = "completed";
      session.endTime = new Date().toISOString();
      await this.completeSession(session);
    } else {
      await this.updateSession(session);
    }

    const stepInfo = !isCompleted ? plannedActivity.steps[session.currentStep] : undefined;

    return {
      success: true,
      currentStep: session.currentStep,
      isCompleted,
      stepInfo,
    };
  }

  /**
   * Pause planned activity session
   */
  static async pauseSession(): Promise<boolean> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "in_progress") {
      return false;
    }

    session.status = "paused";
    await this.updateSession(session);
    console.log("⏸️ Planned activity session paused");
    return true;
  }

  /**
   * Resume planned activity session
   */
  static async resumeSession(): Promise<boolean> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "paused") {
      return false;
    }

    session.status = "in_progress";
    await this.updateSession(session);
    console.log("▶️ Planned activity session resumed");
    return true;
  }

  /**
   * Complete planned activity session
   */
  private static async completeSession(session: PlannedActivitySession): Promise<void> {
    // Calculate compliance score
    const plannedActivity = await this.getPlannedActivity(session.plannedActivityId);
    if (plannedActivity) {
      const totalSteps = plannedActivity.steps.length;
      const completedSteps = session.stepProgress.completedSteps.length;
      session.metrics.compliance = Math.round((completedSteps / totalSteps) * 100);
    }

    // Save to completed sessions
    const completedData = await AsyncStorage.getItem(STORAGE_KEYS.COMPLETED_SESSIONS);
    const completedSessions = completedData ? JSON.parse(completedData) : {};
    completedSessions[session.id] = session;
    await AsyncStorage.setItem(STORAGE_KEYS.COMPLETED_SESSIONS, JSON.stringify(completedSessions));

    // Clear active session
    await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);

    console.log("🏁 Planned activity session completed:", session.id);
  }

  /**
   * Abandon planned activity session
   */
  static async abandonSession(): Promise<boolean> {
    const session = await this.getActiveSession();
    if (!session) {
      return false;
    }

    session.status = "abandoned";
    session.endTime = new Date().toISOString();

    // Save to completed sessions for history
    const completedData = await AsyncStorage.getItem(STORAGE_KEYS.COMPLETED_SESSIONS);
    const completedSessions = completedData ? JSON.parse(completedData) : {};
    completedSessions[session.id] = session;
    await AsyncStorage.setItem(STORAGE_KEYS.COMPLETED_SESSIONS, JSON.stringify(completedSessions));

    // Clear active session
    await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);

    console.log("🚫 Planned activity session abandoned:", session.id);
    return true;
  }

  /**
   * Update session metrics during recording
   */
  static async updateSessionMetrics(
    duration: number,
    distance: number,
    heartRate?: number,
    power?: number
  ): Promise<void> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "in_progress") {
      return;
    }

    session.metrics.actualDuration = duration;
    session.metrics.actualDistance = distance;

    if (heartRate) {
      session.metrics.averageHeartRate = heartRate;
    }

    if (power) {
      session.metrics.averagePower = power;
    }

    session.stepProgress.duration = duration;
    session.stepProgress.distance = distance;

    await this.updateSession(session);
  }

  /**
   * Get current step info
   */
  static async getCurrentStepInfo(): Promise<{
    step?: ActivityStep;
    stepNumber: number;
    totalSteps: number;
    sessionActive: boolean;
  }> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "in_progress") {
      return { stepNumber: 0, totalSteps: 0, sessionActive: false };
    }

    const plannedActivity = await this.getPlannedActivity(session.plannedActivityId);
    if (!plannedActivity) {
      return { stepNumber: 0, totalSteps: 0, sessionActive: false };
    }

    const step = session.currentStep < plannedActivity.steps.length
      ? plannedActivity.steps[session.currentStep]
      : undefined;

    return {
      step,
      stepNumber: session.currentStep + 1,
      totalSteps: plannedActivity.steps.length,
      sessionActive: true,
    };
  }

  /**
   * Check if current metrics meet step targets
   */
  static checkStepCompliance(
    step: ActivityStep,
    currentMetrics: {
      heartRate?: number;
      power?: number;
      pace?: number;
    }
  ): {
    inRange: boolean;
    message?: string;
  } {
    if (!step.targetIntensity) {
      return { inRange: true };
    }

    const { targetIntensity } = step;
    let currentValue: number | undefined;

    switch (targetIntensity.type) {
      case "heartRate":
        currentValue = currentMetrics.heartRate;
        break;
      case "power":
        currentValue = currentMetrics.power;
        break;
      case "pace":
        currentValue = currentMetrics.pace;
        break;
    }

    if (currentValue === undefined) {
      return { inRange: true, message: `No ${targetIntensity.type} data` };
    }

    const { min, max, target } = targetIntensity;

    if (target) {
      const tolerance = target * 0.1; // 10% tolerance
      const inRange = Math.abs(currentValue - target) <= tolerance;

      if (!inRange) {
        const direction = currentValue > target ? "lower" : "higher";
        return {
          inRange: false,
          message: `${targetIntensity.type} should be ${direction} (target: ${target}${targetIntensity.unit})`
        };
      }
    }

    if (min !== undefined && currentValue < min) {
      return {
        inRange: false,
        message: `${targetIntensity.type} too low (min: ${min}${targetIntensity.unit})`
      };
    }

    if (max !== undefined && currentValue > max) {
      return {
        inRange: false,
        message: `${targetIntensity.type} too high (max: ${max}${targetIntensity.unit})`
      };
    }

    return { inRange: true };
  }

  /**
   * Get step progress as percentage
   */
  static async getStepProgress(): Promise<{
    timeProgress: number;
    distanceProgress: number;
    overall: number;
  }> {
    const session = await this.getActiveSession();
    if (!session || session.status !== "in_progress") {
      return { timeProgress: 0, distanceProgress: 0, overall: 0 };
    }

    const plannedActivity = await this.getPlannedActivity(session.plannedActivityId);
    if (!plannedActivity || session.currentStep >= plannedActivity.steps.length) {
      return { timeProgress: 100, distanceProgress: 100, overall: 100 };
    }

    const currentStep = plannedActivity.steps[session.currentStep];
    const stepStartTime = session.stepStartTime ? new Date(session.stepStartTime).getTime() : Date.now();
    const currentTime = Date.now();
    const elapsedTime = (currentTime - stepStartTime) / 1000; // seconds

    let timeProgress = 0;
    let distanceProgress = 0;

    if (currentStep.duration) {
      timeProgress = Math.min(100, (elapsedTime / currentStep.duration) * 100);
    }

    if (currentStep.distance && session.stepProgress.distance > 0) {
      distanceProgress = Math.min(100, (session.stepProgress.distance / currentStep.distance) * 100);
    }

    // Overall progress through the entire planned activity
    const overall = ((session.currentStep + Math.max(timeProgress, distanceProgress) / 100) / plannedActivity.steps.length) * 100;

    return {
      timeProgress: Math.round(timeProgress),
      distanceProgress: Math.round(distanceProgress),
      overall: Math.round(overall),
    };
  }

  /**
   * Get completed sessions
   */
  static async getCompletedSessions(): Promise<PlannedActivitySession[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.COMPLETED_SESSIONS);
      const sessions = data ? JSON.parse(data) : {};
      return Object.values(sessions).sort((a: any, b: any) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    } catch (error) {
      console.error("Failed to get completed sessions:", error);
      return [];
    }
  }

  /**
   * Delete planned activity
   */
  static async deletePlannedActivity(id: string): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PLANNED_ACTIVITIES);
      const activities = data ? JSON.parse(data) : {};
      delete activities[id];
      await AsyncStorage.setItem(STORAGE_KEYS.PLANNED_ACTIVITIES, JSON.stringify(activities));
      console.log("🗑️ Deleted planned activity:", id);
    } catch (error) {
      throw new Error(`Failed to delete planned activity: ${error}`);
    }
  }

  /**
   * Create activity templates
   */
  static async createDefaultTemplates(): Promise<void> {
    const templates: Omit<PlannedActivity, "id" | "metadata">[] = [
      {
        name: "Easy Recovery Ride",
        description: "Low intensity recovery session",
        activityType: "cycling",
        estimatedDuration: 3600, // 60 minutes
        steps: [
          {
            id: "warmup",
            name: "Warm-up",
            type: "warmup",
            duration: 600, // 10 minutes
            targetIntensity: {
              type: "heartRate",
              max: 140,
              unit: "bpm"
            },
            instructions: "Easy spinning to warm up"
          },
          {
            id: "main",
            name: "Easy Pace",
            type: "free",
            duration: 2400, // 40 minutes
            targetIntensity: {
              type: "heartRate",
              min: 120,
              max: 150,
              unit: "bpm"
            },
            instructions: "Maintain comfortable, conversational pace"
          },
          {
            id: "cooldown",
            name: "Cool-down",
            type: "cooldown",
            duration: 600, // 10 minutes
            targetIntensity: {
              type: "heartRate",
              max: 130,
              unit: "bpm"
            },
            instructions: "Easy spinning to cool down"
          }
        ]
      },
      {
        name: "Threshold Intervals",
        description: "4x8min threshold intervals",
        activityType: "cycling",
        estimatedDuration: 4500, // 75 minutes
        estimatedTSS: 100,
        steps: [
          {
            id: "warmup",
            name: "Warm-up",
            type: "warmup",
            duration: 900, // 15 minutes
            instructions: "Progressive warm-up building to zone 2"
          },
          {
            id: "interval1",
            name: "Threshold Interval 1",
            type: "interval",
            duration: 480, // 8 minutes
            targetIntensity: {
              type: "power",
              min: 250,
              max: 280,
              unit: "W"
            },
            instructions: "Maintain steady threshold power"
          },
          {
            id: "recovery1",
            name: "Recovery",
            type: "recovery",
            duration: 180, // 3 minutes
            instructions: "Easy spinning"
          },
          {
            id: "interval2",
            name: "Threshold Interval 2",
            type: "interval",
            duration: 480,
            targetIntensity: {
              type: "power",
              min: 250,
              max: 280,
              unit: "W"
            },
            instructions: "Maintain steady threshold power"
          },
          {
            id: "recovery2",
            name: "Recovery",
            type: "recovery",
            duration: 180,
            instructions: "Easy spinning"
          },
          {
            id: "interval3",
            name: "Threshold Interval 3",
            type: "interval",
            duration: 480,
            targetIntensity: {
              type: "power",
              min: 250,
              max: 280,
              unit: "W"
            },
            instructions: "Maintain steady threshold power"
          },
          {
            id: "recovery3",
            name: "Recovery",
            type: "recovery",
            duration: 180,
            instructions: "Easy spinning"
          },
          {
            id: "interval4",
            name: "Threshold Interval 4",
            type: "interval",
            duration: 480,
            targetIntensity: {
              type: "power",
              min: 250,
              max: 280,
              unit: "W"
            },
            instructions: "Maintain steady threshold power"
          },
          {
            id: "cooldown",
            name: "Cool-down",
            type: "cooldown",
            duration: 900, // 15 minutes
            instructions: "Easy spinning to cool down"
          }
        ]
      }
    ];

    // Save templates (implementation would save these as selectable templates)
    console.log("📚 Default activity templates created");
  }
}

export default PlannedActivityService;
