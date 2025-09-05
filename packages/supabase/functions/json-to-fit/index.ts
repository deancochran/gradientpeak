import { Encoder } from "@garmin/fitsdk";
import { createClient } from "supabase";

// Types for the mobile app JSON payload
interface ActivityPayload {
  activityId: string;
  profileId: string;
  activityData: ActivityData;
}

interface ActivityData {
  id: string;
  profileId: string;
  startedAt: string;
  endedAt: string;
  recordMessages: RecordMessage[];
  eventMessages: EventMessage[];
  hrMessages: HRMessage[];
  hrvMessages: HRVMessage[];
  liveMetrics: LiveMetrics;
  status: string;
}

interface RecordMessage {
  timestamp: string;
  positionLat?: number;
  positionLong?: number;
  altitude?: number;
  distance?: number;
  speed?: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  temperature?: number;
  [key: string]: any;
}

interface EventMessage {
  timestamp: string;
  event?: string | number;
  eventType?: string | number;
  data?: number;
  [key: string]: any;
}

interface HRMessage {
  timestamp: string;
  heartRate?: number;
  [key: string]: any;
}

interface HRVMessage {
  timestamp: string;
  time?: number[];
  [key: string]: any;
}

interface LiveMetrics {
  duration: number;
  distance?: number;
  avgPace?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  minHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  calories?: number;
  totalAscent?: number;
  totalDescent?: number;
  maxElevation?: number;
  minElevation?: number;
  [key: string]: any;
}

// Helper class for writing FIT data to a buffer
class ArrayStream {
  private buffer = new Uint8Array(2 * 1024 * 1024);
  private pos = 0;

  write(data: Uint8Array): void {
    if (this.pos + data.length > this.buffer.length) {
      const newSize = Math.max(
        this.buffer.length * 2,
        this.pos + data.length * 2,
      );
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.buffer.subarray(0, this.pos));
      this.buffer = newBuffer;
    }

    this.buffer.set(data, this.pos);
    this.pos += data.length;
  }

  getBuffer(): Uint8Array {
    return this.buffer.subarray(0, this.pos);
  }
}

// Supabase admin client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Main handler
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ 
      success: false, 
      error: "Method not allowed" 
    }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const operationId = crypto.randomUUID();
  let uploadedFilePath: string | null = null;
  let dbTransactionStarted = false;

  try {
    // Parse and validate the payload
    const body: ActivityPayload = await req.json();
    const { activityId, profileId, activityData } = body;

    console.log(`[${operationId}] Processing activity ${activityId} for profile ${profileId}`);

    // 1️⃣ VALIDATION PHASE
    if (!activityId || !profileId || !activityData) {
      return createErrorResponse(400, "Missing required fields: activityId, profileId, or activityData");
    }

    // Validate activity data structure
    try {
      validateActivityData(activityData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation failed: ${validationError.message}`);
    }

    // Verify the activity exists and belongs to the user
    const { data: existingActivity, error: fetchError } = await supabase
      .from("activities")
      .select("id, profile_id, sync_status")
      .eq("id", activityId)
      .eq("profile_id", profileId)
      .single();

    if (fetchError) {
      console.error(`[${operationId}] Activity lookup failed:`, fetchError);
      return createErrorResponse(404, `Activity not found or access denied: ${fetchError.message}`);
    }

    if (existingActivity.sync_status === "synced") {
      console.log(`[${operationId}] Activity already synced, skipping`);
      return new Response(JSON.stringify({
        success: true,
        activityId,
        message: "Activity already synced",
        alreadySynced: true
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2️⃣ FIT CONVERSION PHASE
    console.log(`[${operationId}] Converting JSON to FIT...`);
    let fitBuffer: Uint8Array;
    try {
      fitBuffer = await createComprehensiveFitFile(activityData);
    } catch (fitError) {
      console.error(`[${operationId}] FIT conversion failed:`, fitError);
      return createErrorResponse(500, `FIT file generation failed: ${fitError.message}`);
    }

    // Validate FIT file size
    if (fitBuffer.length < 100) {
      return createErrorResponse(500, "Generated FIT file is too small to be valid");
    }

    console.log(`[${operationId}] FIT file created: ${fitBuffer.length} bytes`);

    // 3️⃣ STORAGE UPLOAD PHASE
    console.log(`[${operationId}] Uploading FIT file to storage...`);
    const fileName = `${activityId}.fit`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("activity-fit-files")
      .upload(fileName, fitBuffer, {
        contentType: "application/vnd.garmin.fit",
        upsert: true,
      });

    if (uploadError) {
      console.error(`[${operationId}] Storage upload failed:`, uploadError);
      return createErrorResponse(500, `FIT file upload failed: ${uploadError.message}`);
    }

    uploadedFilePath = uploadData.path;
    console.log(`[${operationId}] FIT file uploaded: ${uploadedFilePath}`);

    // 4️⃣ DATABASE TRANSACTION PHASE
    console.log(`[${operationId}] Starting database transaction...`);
    dbTransactionStarted = true;

    try {
      // Use a database transaction to ensure atomicity
      const { data: updateResult, error: dbError } = await supabase.rpc('update_activity_with_fit', {
        p_activity_id: activityId,
        p_profile_id: profileId,
        p_cloud_storage_path: uploadedFilePath,
        p_updated_at: new Date().toISOString()
      });

      if (dbError) {
        throw new Error(`Database transaction failed: ${dbError.message}`);
      }

      dbTransactionStarted = false;
      console.log(`[${operationId}] Activity ${activityId} processed successfully`);

      // 5️⃣ SUCCESS RESPONSE
      return new Response(JSON.stringify({
        success: true,
        activityId,
        fitPath: uploadedFilePath,
        fitSize: fitBuffer.length,
        recordCount: activityData.recordMessages.length,
        duration: activityData.liveMetrics.duration,
        operationId
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (dbError) {
      console.error(`[${operationId}] Database update failed, rolling back...`, dbError);
      
      // Rollback: Delete the uploaded FIT file
      try {
        await supabase.storage.from("activity-fit-files").remove([fileName]);
        console.log(`[${operationId}] Successfully rolled back FIT file upload`);
      } catch (rollbackError) {
        console.error(`[${operationId}] CRITICAL: Failed to rollback FIT file:`, rollbackError);
      }

      throw new Error(`Database transaction failed: ${dbError.message}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`[${operationId}] Error processing activity:`, error);

    // Emergency cleanup if we have partial state
    if (uploadedFilePath && dbTransactionStarted) {
      try {
        const fileName = uploadedFilePath.split("/").pop();
        if (fileName) {
          await supabase.storage.from("activity-fit-files").remove([fileName]);
          console.log(`[${operationId}] Emergency cleanup: removed orphaned FIT file`);
        }
      } catch (cleanupError) {
        console.error(`[${operationId}] CRITICAL: Emergency cleanup failed:`, cleanupError);
      }
    }

    return createErrorResponse(500, errorMessage);
  }
});

// Helper function to create consistent error responses
function createErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function validateActivityData(data: ActivityData): void {
  if (!data.id || !data.profileId || !data.startedAt || !data.endedAt) {
    throw new Error("Missing required fields: id, profileId, startedAt, or endedAt");
  }

  const startTime = new Date(data.startedAt);
  const endTime = new Date(data.endedAt);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new Error("Invalid timestamps - unable to parse startedAt or endedAt");
  }

  if (endTime <= startTime) {
    throw new Error("End time must be after start time");
  }

  // Validate duration makes sense
  const expectedDuration = (endTime.getTime() - startTime.getTime()) / 1000;
  if (data.liveMetrics?.duration && Math.abs(data.liveMetrics.duration - expectedDuration) > 300) {
    console.warn(`Duration mismatch: calculated=${expectedDuration}s, provided=${data.liveMetrics.duration}s`);
  }

  // Ensure required arrays exist (with defaults)
  data.recordMessages = data.recordMessages || [];
  data.eventMessages = data.eventMessages || [];
  data.hrMessages = data.hrMessages || [];
  data.hrvMessages = data.hrvMessages || [];
  data.liveMetrics = data.liveMetrics || { duration: expectedDuration };

  // Validate record messages have timestamps
  for (let i = 0; i < data.recordMessages.length; i++) {
    const record = data.recordMessages[i];
    if (!record.timestamp || isNaN(new Date(record.timestamp).getTime())) {
      throw new Error(`Record message ${i} has invalid timestamp`);
    }
  }
}

async function createComprehensiveFitFile(
  activity: ActivityData,
): Promise<Uint8Array> {
  const stream = new ArrayStream();
  const encoder = new Encoder(stream);

  try {
    const startTime = new Date(activity.startedAt);
    const endTime = new Date(activity.endedAt);
    const startTimestamp = Math.floor(startTime.getTime() / 1000);
    const endTimestamp = Math.floor(endTime.getTime() / 1000);

    // 1. FILE_ID MESSAGE - Required for all FIT files
    const fileIdMsg = encoder.createMessage(0);
    fileIdMsg.setFieldValue("type", 4); // Activity file
    fileIdMsg.setFieldValue("manufacturer", 65534); // Development
    fileIdMsg.setFieldValue("product", 1); // TurboFit
    fileIdMsg.setFieldValue(
      "serial_number",
      parseInt(activity.id.slice(-8), 16) || 12345,
    );
    fileIdMsg.setFieldValue("time_created", startTimestamp);
    encoder.writeMessage(fileIdMsg);

    // 2. DEVICE_INFO MESSAGE
    const deviceInfoMsg = encoder.createMessage(23);
    deviceInfoMsg.setFieldValue("timestamp", startTimestamp);
    deviceInfoMsg.setFieldValue("device_index", 0);
    deviceInfoMsg.setFieldValue("manufacturer", 65534);
    deviceInfoMsg.setFieldValue("product", 1);
    deviceInfoMsg.setFieldValue("software_version", 100);
    encoder.writeMessage(deviceInfoMsg);

    // 3. START EVENT
    const startEventMsg = encoder.createMessage(21);
    startEventMsg.setFieldValue("timestamp", startTimestamp);
    startEventMsg.setFieldValue("event", 0); // Timer
    startEventMsg.setFieldValue("event_type", 0); // Start
    encoder.writeMessage(startEventMsg);

    // 4. RECORD MESSAGES (GPS + sensor data)
    let recordsWritten = 0;
    for (const record of activity.recordMessages) {
      try {
        const fitRecordMsg = encoder.createMessage(20);
        const recordTimestamp = Math.floor(
          new Date(record.timestamp).getTime() / 1000,
        );
        
        // Validate timestamp is within activity bounds
        if (recordTimestamp < startTimestamp || recordTimestamp > endTimestamp) {
          console.warn(`Record timestamp ${recordTimestamp} outside activity bounds, skipping`);
          continue;
        }

        fitRecordMsg.setFieldValue("timestamp", recordTimestamp);

        // GPS data (convert to semicircles)
        if (
          record.positionLat !== undefined &&
          record.positionLong !== undefined &&
          record.positionLat !== null &&
          record.positionLong !== null
        ) {
          // Validate GPS coordinates are reasonable
          if (Math.abs(record.positionLat) <= 90 && Math.abs(record.positionLong) <= 180) {
            fitRecordMsg.setFieldValue(
              "position_lat",
              Math.round(record.positionLat * (Math.pow(2, 31) / 180)),
            );
            fitRecordMsg.setFieldValue(
              "position_long",
              Math.round(record.positionLong * (Math.pow(2, 31) / 180)),
            );
          }
        }

        // Altitude (offset by 500m, scale by 5)
        if (record.altitude !== undefined && record.altitude !== null) {
          fitRecordMsg.setFieldValue(
            "altitude",
            Math.round((record.altitude + 500) * 5),
          );
        }

        // Distance (meters to centimeters)
        if (record.distance !== undefined && record.distance !== null && record.distance >= 0) {
          fitRecordMsg.setFieldValue(
            "distance",
            Math.round(record.distance * 100),
          );
        }

        // Speed (m/s to mm/s)
        if (record.speed !== undefined && record.speed !== null && record.speed >= 0) {
          fitRecordMsg.setFieldValue("speed", Math.round(record.speed * 1000));
        }

        // Sensor data with validation
        if (record.heartRate !== undefined && record.heartRate !== null && 
            record.heartRate > 0 && record.heartRate < 300) {
          fitRecordMsg.setFieldValue("heart_rate", Math.round(record.heartRate));
        }
        
        if (record.power !== undefined && record.power !== null && 
            record.power >= 0 && record.power < 3000) {
          fitRecordMsg.setFieldValue("power", Math.round(record.power));
        }
        
        if (record.cadence !== undefined && record.cadence !== null && 
            record.cadence >= 0 && record.cadence < 300) {
          fitRecordMsg.setFieldValue("cadence", Math.round(record.cadence));
        }
        
        if (record.temperature !== undefined && record.temperature !== null) {
          fitRecordMsg.setFieldValue("temperature", Math.round(record.temperature));
        }

        encoder.writeMessage(fitRecordMsg);
        recordsWritten++;
      } catch (error) {
        console.warn(`Failed to process record message:`, error);
      }
    }

    console.log(`Processed ${recordsWritten}/${activity.recordMessages.length} record messages`);

    // 5. LAP MESSAGE
    const lapMsg = encoder.createMessage(19);
    lapMsg.setFieldValue("timestamp", endTimestamp);
    lapMsg.setFieldValue("start_time", startTimestamp);
    lapMsg.setFieldValue(
      "total_elapsed_time",
      Math.round(activity.liveMetrics.duration * 1000), // Convert to milliseconds
    );
    lapMsg.setFieldValue(
      "total_timer_time",
      Math.round(activity.liveMetrics.duration * 1000),
    );
    lapMsg.setFieldValue("message_index", 0);

    // Add validated metrics to lap
    if (activity.liveMetrics.distance && activity.liveMetrics.distance > 0) {
      lapMsg.setFieldValue(
        "total_distance",
        Math.round(activity.liveMetrics.distance * 100),
      );
    }
    if (activity.liveMetrics.avgSpeed && activity.liveMetrics.avgSpeed > 0) {
      lapMsg.setFieldValue(
        "avg_speed",
        Math.round(activity.liveMetrics.avgSpeed * 1000),
      );
    }
    if (activity.liveMetrics.avgHeartRate && activity.liveMetrics.avgHeartRate > 0) {
      lapMsg.setFieldValue(
        "avg_heart_rate",
        Math.round(activity.liveMetrics.avgHeartRate),
      );
    }
    if (activity.liveMetrics.avgPower && activity.liveMetrics.avgPower >= 0) {
      lapMsg.setFieldValue(
        "avg_power",
        Math.round(activity.liveMetrics.avgPower),
      );
    }
    if (activity.liveMetrics.calories && activity.liveMetrics.calories > 0) {
      lapMsg.setFieldValue(
        "total_calories",
        Math.round(activity.liveMetrics.calories),
      );
    }

    encoder.writeMessage(lapMsg);

    // 6. SESSION MESSAGE
    const sessionMsg = encoder.createMessage(18);
    sessionMsg.setFieldValue("timestamp", endTimestamp);
    sessionMsg.setFieldValue("start_time", startTimestamp);
    sessionMsg.setFieldValue(
      "total_elapsed_time",
      Math.round(activity.liveMetrics.duration * 1000),
    );
    sessionMsg.setFieldValue(
      "total_timer_time",
      Math.round(activity.liveMetrics.duration * 1000),
    );
    sessionMsg.setFieldValue("message_index", 0);
    sessionMsg.setFieldValue("sport", 0); // Generic
    sessionMsg.setFieldValue("first_lap_index", 0);
    sessionMsg.setFieldValue("num_laps", 1);

    // Copy validated metrics from lap
    if (activity.liveMetrics.distance && activity.liveMetrics.distance > 0) {
      sessionMsg.setFieldValue(
        "total_distance",
        Math.round(activity.liveMetrics.distance * 100),
      );
    }
    if (activity.liveMetrics.avgSpeed && activity.liveMetrics.avgSpeed > 0) {
      sessionMsg.setFieldValue(
        "avg_speed",
        Math.round(activity.liveMetrics.avgSpeed * 1000),
      );
    }
    if (activity.liveMetrics.avgHeartRate && activity.liveMetrics.avgHeartRate > 0) {
      sessionMsg.setFieldValue(
        "avg_heart_rate",
        Math.round(activity.liveMetrics.avgHeartRate),
      );
    }
    if (activity.liveMetrics.avgPower && activity.liveMetrics.avgPower >= 0) {
      sessionMsg.setFieldValue(
        "avg_power",
        Math.round(activity.liveMetrics.avgPower),
      );
    }
    if (activity.liveMetrics.calories && activity.liveMetrics.calories > 0) {
      sessionMsg.setFieldValue(
        "total_calories",
        Math.round(activity.liveMetrics.calories),
      );
    }

    encoder.writeMessage(sessionMsg);

    // 7. ACTIVITY MESSAGE
    const activityMsg = encoder.createMessage(34);
    activityMsg.setFieldValue("timestamp", endTimestamp);
    activityMsg.setFieldValue(
      "total_timer_time",
      Math.round(activity.liveMetrics.duration * 1000),
    );
    activityMsg.setFieldValue("num_sessions", 1);
    activityMsg.setFieldValue("type", 0); // Manual
    encoder.writeMessage(activityMsg);

    // 8. STOP EVENT
    const stopEventMsg = encoder.createMessage(21);
    stopEventMsg.setFieldValue("timestamp", endTimestamp);
    stopEventMsg.setFieldValue("event", 0); // Timer
    stopEventMsg.setFieldValue("event_type", 1); // Stop
    encoder.writeMessage(stopEventMsg);

    encoder.close();
    return stream.getBuffer();
  } catch (error) {
    throw new Error(`FIT file creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}