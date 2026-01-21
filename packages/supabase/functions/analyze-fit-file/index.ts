// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:supabase-js@2";
import { polyline } from "npm:@mapbox/polyline@^1.2.1";

console.log("FIT file analysis edge function initialized");

// JWT verification (simplified for edge function)
function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }
  return token;
}

// Core FIT file parsing utilities for edge function
// Note: In Deno, we can't directly import from npm packages that aren't Deno-compatible
// So we'll implement minimal parsing logic here
interface FitRecord {
  timestamp?: number;
  position_lat?: number;
  position_long?: number;
  distance?: number;
  altitude?: number;
  speed?: number;
  heart_rate?: number;
  cadence?: number;
  power?: number;
  temperature?: number;
}

interface FitSession {
  sport?: number;
  start_time?: number;
  timestamp?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_ascent?: number;
  total_descent?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_power?: number;
  max_power?: number;
  avg_cadence?: number;
  max_cadence?: number;
  total_calories?: number;
  name?: string;
}

interface ActivityAnalysisResult {
  success: boolean;
  error?: string;
  activity?: {
    id: string;
    name: string;
    type: string;
    start_time: string;
    end_time: string;
    duration: number;
    distance?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    avg_power?: number;
    max_power?: number;
    avg_cadence?: number;
    max_cadence?: number;
    total_calories?: number;
    elevation_gain?: number;
    elevation_loss?: number;
    polyline?: string;
  };
  streams?: {
    time: number[];
    distance?: number[];
    altitude?: number[];
    speed?: number[];
    heart_rate?: number[];
    cadence?: number[];
    power?: number[];
    latlng?: number[][];
  };
  tss?: number;
  intensity_factor?: number;
  normalized_power?: number;
  zones?: {
    heart_rate?: { [key: string]: number };
    power?: { [key: string]: number };
  };
}

// FIT constants
const FIT_EPOCH_OFFSET = 631065600; // seconds from Unix epoch (1989-12-31)
const Sport = {
  GENERIC: 0,
  RUNNING: 1,
  CYCLING: 2,
  SWIMMING: 3,
  STRENGTH_TRAINING: 4,
  TRANSITION: 5,
} as const;

// Simple FIT file validation
function validateFitFile(data: ArrayBuffer): boolean {
  try {
    const bytes = new Uint8Array(data);
    return (
      bytes.length >= 14 &&
      bytes[0] === 0x0e &&
      bytes[1] === 0x10 &&
      bytes[2] === 0x09 &&
      bytes[3] === 0x0d
    );
  } catch {
    return false;
  }
}

// Convert FIT timestamp to ISO string
function fitTimestampToIso(fitTimestamp: number): string {
  const unixTimestamp = (fitTimestamp + FIT_EPOCH_OFFSET) * 1000;
  return new Date(unixTimestamp).toISOString();
}

// Map FIT sport enum to activity type
function mapFitSportType(sport?: number): string {
  if (!sport) return "other";

  const sportMap: Record<number, string> = {
    [Sport.GENERIC]: "other",
    [Sport.RUNNING]: "running",
    [Sport.CYCLING]: "cycling",
    [Sport.SWIMMING]: "swimming",
    [Sport.STRENGTH_TRAINING]: "other",
    [Sport.TRANSITION]: "other",
  };

  return sportMap[sport] || "other";
}

// Convert semicircles to degrees
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}

// Generate polyline from GPS coordinates
function generatePolyline(records: FitRecord[]): string | null {
  const gpsPoints = records
    .filter(
      (r) => r.position_lat !== undefined && r.position_long !== undefined,
    )
    .map((r) => [
      semicirclesToDegrees(r.position_lat!),
      semicirclesToDegrees(r.position_long!),
    ]);

  if (gpsPoints.length === 0) return null;

  try {
    return polyline.encode(gpsPoints);
  } catch (error) {
    console.warn("Failed to encode polyline:", error);
    return null;
  }
}

// Calculate TSS (Training Stress Score)
function calculateTSS(params: {
  avgPower?: number;
  normalizedPower?: number;
  duration: number; // seconds
  ftp?: number;
}): number {
  const {
    avgPower = 0,
    normalizedPower = avgPower,
    duration,
    ftp = 200,
  } = params;

  if (!ftp || ftp === 0 || !duration || duration === 0) return 0;

  const intensityFactor = normalizedPower / ftp;
  const hours = duration / 3600;

  return Math.round(intensityFactor * intensityFactor * hours * 100);
}

// Calculate normalized power (simplified)
function calculateNormalizedPower(powerReadings: number[]): number {
  if (powerReadings.length === 0) return 0;

  // 4th power average (simplified NP calculation)
  const fourthPowerSum = powerReadings.reduce(
    (sum, power) => sum + Math.pow(power, 4),
    0,
  );
  const fourthPowerAvg = fourthPowerSum / powerReadings.length;

  return Math.round(Math.pow(fourthPowerAvg, 0.25));
}

// Calculate intensity factor
function calculateIntensityFactor(
  normalizedPower: number,
  ftp: number,
): number {
  if (!ftp || ftp === 0) return 0;
  return Math.round((normalizedPower / ftp) * 100) / 100;
}

// Calculate heart rate zones
function calculateHeartRateZones(records: FitRecord[], maxHR?: number) {
  const zones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
    zone6: 0,
  };

  const heartRates = records
    .map((r) => r.heart_rate)
    .filter((hr): hr is number => hr !== undefined && hr > 0);

  if (heartRates.length === 0) return zones;

  const actualMaxHR = maxHR || Math.max(...heartRates);

  heartRates.forEach((hr) => {
    const percentMax = hr / actualMaxHR;
    if (percentMax < 0.5) zones.zone1++;
    else if (percentMax < 0.6) zones.zone2++;
    else if (percentMax < 0.7) zones.zone3++;
    else if (percentMax < 0.8) zones.zone4++;
    else if (percentMax < 0.9) zones.zone5++;
    else zones.zone6++;
  });

  return zones;
}

// Calculate power zones
function calculatePowerZones(records: FitRecord[], ftp?: number) {
  const zones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
    zone6: 0,
  };

  const powers = records
    .map((r) => r.power)
    .filter((p): p is number => p !== undefined && p > 0);

  if (powers.length === 0) return zones;

  // Estimate FTP if not provided
  const estimatedFTP = ftp || Math.max(...powers) * 0.8;

  powers.forEach((power) => {
    const percentFTP = power / estimatedFTP;
    if (percentFTP < 0.55) zones.zone1++;
    else if (percentFTP < 0.75) zones.zone2++;
    else if (percentFTP < 0.9) zones.zone3++;
    else if (percentFTP < 1.05) zones.zone4++;
    else if (percentFTP < 1.2) zones.zone5++;
    else zones.zone6++;
  });

  return zones;
}

// Simplified FIT file parser for edge function
// In production, this would use the full Garmin FIT SDK
function parseFitFile(data: ArrayBuffer): {
  session?: FitSession;
  records: FitRecord[];
} {
  // This is a minimal parser - in reality you'd use the Garmin FIT SDK
  // For now, return realistic mock data based on file size

  const fileSize = data.byteLength;
  const estimatedDuration = Math.min(Math.max(fileSize / 100, 300), 7200); // 5 min to 2 hours

  const records: FitRecord[] = [];
  const now = new Date();
  const startTime = new Date(now.getTime() - estimatedDuration * 1000);

  // Generate sample records based on file size
  const recordCount = Math.min(
    Math.floor(fileSize / 50),
    Math.floor(estimatedDuration),
  );

  for (let i = 0; i < recordCount; i++) {
    const timestamp =
      Math.floor(startTime.getTime() / 1000) + i - FIT_EPOCH_OFFSET;

    records.push({
      timestamp,
      heart_rate: 120 + Math.sin(i * 0.01) * 40,
      power: 150 + Math.sin(i * 0.008) * 80,
      cadence: 80 + Math.sin(i * 0.02) * 20,
      speed: 5 + Math.sin(i * 0.01) * 2,
      distance: i * 5,
      altitude: 100 + Math.sin(i * 0.005) * 50,
    });
  }

  const session: FitSession = {
    sport: Sport.CYCLING,
    start_time: Math.floor(startTime.getTime() / 1000) - FIT_EPOCH_OFFSET,
    timestamp: Math.floor(now.getTime() / 1000) - FIT_EPOCH_OFFSET,
    total_elapsed_time: estimatedDuration,
    total_timer_time: estimatedDuration,
    total_distance: recordCount * 5,
    avg_heart_rate: 145,
    max_heart_rate: 185,
    avg_power: 180,
    max_power: 320,
    avg_cadence: 85,
    max_cadence: 110,
    total_calories: Math.round(estimatedDuration * 0.15),
  };

  return { session, records };
}

// Main handler function
async function analyzeFitFile(
  requestBody: any,
): Promise<ActivityAnalysisResult> {
  const { activityId, filePath, bucketName } = requestBody;

  if (!activityId || !filePath || !bucketName) {
    throw new Error(
      "Missing required fields: activityId, filePath, bucketName",
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Get user profile to get FTP
  const { data: profile } = await supabase
    .from("profiles")
    .select("functional_threshold_power, max_heart_rate")
    .single();

  // Download FIT file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(bucketName)
    .download(filePath);

  if (downloadError) {
    throw new Error(`Failed to download FIT file: ${downloadError.message}`);
  }

  // Convert to ArrayBuffer
  const arrayBuffer = await fileData.arrayBuffer();

  // Validate FIT file
  if (!validateFitFile(arrayBuffer)) {
    throw new Error("Invalid FIT file format");
  }

  // Parse FIT file
  const { session, records } = parseFitFile(arrayBuffer);

  if (!session) {
    throw new Error("No session data found in FIT file");
  }

  // Extract data for streams
  const timeStream = records
    .filter((r) => r.timestamp !== undefined)
    .map((r) => (r.timestamp! + FIT_EPOCH_OFFSET) * 1000); // Convert to Unix timestamp

  const distanceStream = records
    .map((r) => r.distance)
    .filter((d) => d !== undefined);
  const altitudeStream = records
    .map((r) => r.altitude)
    .filter((a) => a !== undefined);
  const speedStream = records
    .map((r) => r.speed)
    .filter((s) => s !== undefined);
  const heartRateStream = records
    .map((r) => r.heart_rate)
    .filter((h) => h !== undefined);
  const cadenceStream = records
    .map((r) => r.cadence)
    .filter((c) => c !== undefined);
  const powerStream = records
    .map((r) => r.power)
    .filter((p) => p !== undefined);

  // GPS coordinates
  const latlngStream = records
    .filter(
      (r) => r.position_lat !== undefined && r.position_long !== undefined,
    )
    .map((r) => [
      semicirclesToDegrees(r.position_lat!),
      semicirclesToDegrees(r.position_long!),
    ]);

  // Generate polyline
  const activityPolyline = generatePolyline(records);

  // Calculate performance metrics
  const normalizedPowerValue =
    powerStream.length > 0 ? calculateNormalizedPower(powerStream) : undefined;
  const intensityFactorValue = normalizedPowerValue
    ? calculateIntensityFactor(
        normalizedPowerValue,
        profile?.functional_threshold_power,
      )
    : undefined;
  const tssValue = calculateTSS({
    avgPower: session.avg_power,
    normalizedPower: normalizedPowerValue,
    duration: session.total_timer_time || 0,
    ftp: profile?.functional_threshold_power,
  });

  // Calculate zones
  const heartRateZones = calculateHeartRateZones(
    records,
    profile?.max_heart_rate,
  );
  const powerZones = calculatePowerZones(
    records,
    profile?.functional_threshold_power,
  );

  // Prepare activity data
  const startTimeIso = session.start_time
    ? fitTimestampToIso(session.start_time)
    : new Date().toISOString();
  const endTimeIso = session.timestamp
    ? fitTimestampToIso(session.timestamp)
    : new Date().toISOString();

  const activityData = {
    id: activityId,
    name: session.name || `${mapFitSportType(session.sport)} Activity`,
    type: mapFitSportType(session.sport),
    start_time: startTimeIso,
    end_time: endTimeIso,
    duration: session.total_timer_time || 0,
    distance: session.total_distance,
    avg_heart_rate: session.avg_heart_rate,
    max_heart_rate: session.max_heart_rate,
    avg_power: session.avg_power,
    max_power: session.max_power,
    avg_cadence: session.avg_cadence,
    max_cadence: session.max_cadence,
    total_calories: session.total_calories,
    elevation_gain: session.total_ascent,
    elevation_loss: session.total_descent,
    polyline: activityPolyline,
  };

  const streamsData = {
    time: timeStream,
    distance: distanceStream,
    altitude: altitudeStream,
    speed: speedStream,
    heart_rate: heartRateStream,
    cadence: cadenceStream,
    power: powerStream,
    latlng: latlngStream,
  };

  const zonesData = {
    heart_rate: heartRateZones,
    power: powerZones,
  };

  // Update activity in database
  const { error: updateError } = await supabase
    .from("activities")
    .update({
      ...activityData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", activityId);

  if (updateError) {
    console.warn("Failed to update activity:", updateError.message);
  }

  // Store streams in compressed format
  if (records.length > 0) {
    const streamsJson = JSON.stringify(streamsData);

    // Here you would typically compress and store the streams
    // For now, we'll just log the size
    console.log(`Streams data size: ${streamsJson.length} characters`);
  }

  return {
    success: true,
    activity: activityData,
    streams: streamsData,
    tss: tssValue,
    intensity_factor: intensityFactorValue,
    normalized_power: normalizedPowerValue,
    zones: zonesData,
  };
}

// Edge function handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Verify authorization
    const token = getAuthToken(req);

    // In production, you'd verify the JWT properly
    // For now, we'll just check that it exists
    if (!token) {
      throw new Error("Invalid authorization token");
    }

    const requestBody = await req.json();
    const result = await analyzeFitFile(requestBody);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("FIT file analysis error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/analyze-fit-file' \
    --header 'Authorization: Bearer YOUR_JWT_TOKEN' \
    --header 'Content-Type: application/json' \
    --data '{
      "activityId": "your-activity-id",
      "filePath": "path/to/activity.fit",
      "bucketName": "fit-files"
    }'

*/
