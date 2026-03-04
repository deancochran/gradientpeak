import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface SyncActivityRequest {
  activityId: string;
  profileId: string;
  startedAt: string;
  liveMetrics: Record<string, any>;
  filePath: string;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const body: SyncActivityRequest = await req.json();
    const { activityId, profileId, startedAt, liveMetrics, filePath } = body;

    console.log(`Processing activity sync for ${activityId}`);

    // Step 1: Verify JSON file exists in storage
    const { data: fileExists, error: storageError } = await supabase.storage
      .from("activity-json-files")
      .list(`${profileId}/`, { search: `${activityId}.json` });

    if (storageError || !fileExists || fileExists.length === 0) {
      console.error("JSON file not found in storage:", storageError);
      return new Response(JSON.stringify({ error: "JSON file not found" }), {
        status: 400,
      });
    }

    // Step 2: Download and parse the JSON file from storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("activity-json-files")
      .download(filePath);

    if (downloadError) {
      console.error(
        `Error downloading JSON file from path: ${filePath}`,
        downloadError,
      );
      return new Response(
        JSON.stringify({ error: "Failed to download activity data" }),
        {
          status: 500,
        },
      );
    }

    const fileText = await fileBlob.text();
    let activityData = {};
    if (fileText) {
      try {
        activityData = JSON.parse(fileText);
      } catch (e) {
        console.error(`Error parsing activity data for ${activityId}:`, e);
        return new Response(
          JSON.stringify({ error: "Malformed activity data file" }),
          {
            status: 400,
          },
        );
      }
    }

    // Merge liveMetrics with file data, giving precedence to file data
    const fullActivityMetrics = { ...liveMetrics, ...activityData };

    // Step 3: Extract metrics for database storage
    const extractMetric = (key: string): number | null => {
      const value = fullActivityMetrics[key];
      if (value == null) return null;
      const num = Number(value);
      return isNaN(num) ? null : num;
    };

    const extractAndRoundMetric = (key: string): number | null => {
      const value = fullActivityMetrics[key];
      if (value == null) return null;
      const num = Number(value);
      return isNaN(num) ? null : Math.round(num);
    };

    // Step 4: Prepare activity payload for database
    const activityPayload = {
      id: activityId,
      profile_id: profileId,
      json_storage_path: filePath,
      started_at: startedAt,
      sync_status: "synced",
      summary_metrics: fullActivityMetrics,
      total_elapsed_time: extractAndRoundMetric("totalElapsedTime"),
      total_timer_time: extractAndRoundMetric("totalTimerTime"),
      duration: extractAndRoundMetric("totalTimerTime"), // Map to existing duration column
      distance: extractMetric("distance"),
      avg_speed: extractMetric("avgSpeed"),
      max_speed: extractMetric("maxSpeed"),
      total_ascent: extractMetric("totalAscent"),
      total_descent: extractMetric("totalDescent"),
      avg_heart_rate: extractAndRoundMetric("avgHeartRate"),
      max_heart_rate: extractAndRoundMetric("maxHeartRate"),
      avg_power: extractAndRoundMetric("avgPower"),
      normalized_power: extractAndRoundMetric("normalizedPower"),
      avg_cadence: extractAndRoundMetric("avgCadence"),
      updated_at: new Date().toISOString(),
    };

    // Step 4: Upsert activity metadata to database
    const { error: dbError } = await supabase
      .from("activities")
      .upsert(activityPayload, { onConflict: "id" });

    if (dbError) {
      console.error("Database update failed:", dbError);
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 500,
      });
    }

    console.log(`Activity ${activityId} synced successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        activityId,
        message: "Activity synced successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Sync activity error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
