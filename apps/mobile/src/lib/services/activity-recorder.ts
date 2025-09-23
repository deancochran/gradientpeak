import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicPlannedActivitiesRow,
} from "@repo/core";

/**
 * Recording states for an activity session
 */
export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

/**
 * In-memory session state during recording
 */
export interface RecordingSession {
  id: string;
  profileId: string;
  startedAt: Date;
  state: RecordingState;
  activityType: PublicActivityType;
  plannedActivity?: PublicPlannedActivitiesRow;

  currentMetrics: LiveMetrics; // real-time dashboard metrics

  totalElapsedTime: number; // wall-clock time
  movingTime: number; // actual moving time
  lastResumeTime: Date | null; // used to compute movingTime during pauses

  lastCheckpointAt: Date; // timestamp of last saved chunk
  dataPointsRecorded: number; // counter for total points recorded
}

/**
 * ActivityRecordingService manages recording sessions, streams, and backend upload.
 *
 * Full workflow:
 * 1. Session creation → insert row into local SQLite DB (activityRecordings)
 * 2. Live data capture → update in-memory `LiveMetrics` for dashboard
 * 3. Chunked storage → periodically store metric chunks in activity_metric_streams
 * 4. Finish recording → compute summary metrics and update local DB
 * 5. Upload → compress all metric chunks and upload to Supabase backend via TRPC
 */
export class ActivityRecordingService {
  /** In-memory map of active sessions keyed by session id */
  static sessions: Record<string, RecordingSession> = {};

  // ----------------------
  // Session Management
  // ----------------------

  /**
   * Creates a new recording session
   * @param profileId - user profile id
   * @param activityType - type of activity
   * @param plannedActivity - optional planned activity
   */
  static async createActivityRecording(
    profileId: string,
    activityType: PublicActivityType,
    plannedActivity?: PublicPlannedActivitiesRow,
  ): Promise<RecordingSession> {
    const id = crypto.randomUUID();
    const startedAt = new Date();

    const session: RecordingSession = {
      id,
      profileId,
      startedAt,
      state: "pending",
      activityType,
      plannedActivity,
      currentMetrics: {},
      totalElapsedTime: 0,
      movingTime: 0,
      lastResumeTime: null,
      lastCheckpointAt: startedAt,
      dataPointsRecorded: 0,
    };

    this.sessions[id] = session;

    // Persist session in local DB
    await db.insert(activityRecordings).values({
      id,
      profileId,
      activityType,
      state: "ready",
      startedAt: startedAt.getTime(),
      plannedActivityId: plannedActivity?.id,
      createdAt: Date.now(),
    });

    return session;
  }

  /**
   * Starts recording by updating session state and timestamp
   */
  static async startActivityRecording(id: string) {
    const session = this.sessions[id];
    session.state = "recording";
    session.lastResumeTime = new Date();

    await db
      .update(activityRecordings)
      .set({ state: "recording" })
      .where({ id });
  }

  /**
   * Pauses a recording session
   */
  static async pauseActivityRecording(id: string) {
    const session = this.sessions[id];
    if (session.lastResumeTime) {
      session.movingTime += Date.now() - session.lastResumeTime.getTime();
    }
    session.state = "paused";
    session.lastResumeTime = null;

    await db.update(activityRecordings).set({ state: "paused" }).where({ id });
  }

  /**
   * Resumes a paused recording session
   */
  static async resumeActivityRecording(id: string) {
    const session = this.sessions[id];
    session.state = "recording";
    session.lastResumeTime = new Date();

    await db
      .update(activityRecordings)
      .set({ state: "recording" })
      .where({ id });
  }

  /**
   * Finishes a recording session:
   * - Computes aggregate metrics (distance, calories, averages)
   * - Updates local DB
   */
  static async finishActivityRecording(id: string) {
    const session = this.sessions[id];
    if (session.lastResumeTime) {
      session.movingTime += Date.now() - session.lastResumeTime.getTime();
    }

    session.state = "finished";
    session.totalElapsedTime = Date.now() - session.startedAt.getTime();
    session.finishedAt = new Date();

    // Compute activity aggregates from local chunks
    const aggregates = computeActivityAggregates(session);

    // Persist computed metrics
    await db
      .update(activityRecordings)
      .set({
        state: "finished",
        finishedAt: session.finishedAt.getTime(),
        ...aggregates,
      })
      .where({ id });
  }

  // ----------------------
  // Stream Management
  // ----------------------

  /**
   * Creates a new chunk of metric data
   * @param chunk - metric chunk with timestamps and raw data
   *
   * Data flow:
   * 1. Capture high-frequency metric data in memory
   * 2. Every 3–5s, flush chunk to local DB
   * 3. Update lastCheckpointAt timestamp for recovery
   */
  static async createActivityRecordingStream(chunk: {
    activityRecordingId: string;
    metric: PublicActivityMetric;
    dataType: PublicActivityMetricDataType;
    chunkIndex: number;
    startTime: number;
    endTime: number;
    data: number[] | [number, number][];
    timestamps: number[];
    moving?: boolean[];
    sampleCount: number;
  }) {
    return db.insert(activityMetricStreams).values(chunk);
  }

  /**
   * List all metric chunks for a given activity
   */
  static async listActivityRecordingStreams(activityId: string) {
    return db
      .select()
      .from(activityMetricStreams)
      .where({ activityRecordingId: activityId });
  }

  /**
   * Compresses all metric chunks and uploads to backend
   *
   * Data flow:
   * 1. Query all local chunks for an activity
   * 2. Group by metric
   * 3. Concatenate data & timestamps
   * 4. Compress each metric using gzipEncode
   * 5. Send to Supabase via TRPC mutation
   */
  static async uploadCompletedActivity(activityId: string) {
    const chunks = await this.listActivityRecordingStreams(activityId);

    const grouped = groupBy(chunks, (c) => c.metric);

    for (const [metric, metricChunks] of Object.entries(grouped)) {
      const combinedData = metricChunks.flatMap((c) => c.data);
      const combinedTimestamps = metricChunks.flatMap((c) => c.timestamps);

      const compressed = gzipEncode({
        data: combinedData,
        timestamps: combinedTimestamps,
      });

      await trpcClient.uploadStream.mutate({
        activityId,
        metric,
        seriesType: "time",
        resolution: "high",
        originalSize: combinedData.length,
        compressedData: compressed,
      });
    }
  }
}
