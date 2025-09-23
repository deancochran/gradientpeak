# App Update: Data Flow for Activity Recording

### **Data Flow**

1. **Session Creation**

   * User initiates an activity in the app.
   * `ActivityRecorderService.createActivityRecording()` inserts a new row into the local SQLite `activity_recordings` table.
   * Minimal session state is held in memory (`RecordingSession`) for live metrics.

2. **Live Metrics Collection**

   * Sensors (GPS, BLE) send high-frequency data.
   * Data is processed in memory to update `LiveMetrics`.
   * Metrics include: speed, heart rate, cadence, power, altitude, distance, moving.

3. **Chunked Stream Storage**

   * Every few seconds, sensor data is chunked into arrays.
   * Chunks are inserted into `activity_metric_streams` (or route streams if GPS/altitude/elevation).
   * Local storage uses a `sync_status` flag (`local_only`) for offline resilience.

4. **Activity Completion**

   * User stops the recording: `ActivityRecorderService.finishActivityRecording()`.
   * Final aggregates are computed (distance, movingTime, calories, average/max metrics).
   * Completed activity row inserted into `activities` table with `total_time = finishedAt - startedAt`.

5. **Backend Sync**

   * `ActivityRecorderService.uploadCompletedActivity()`:

     * Reads all local chunks grouped by metric.
     * Compresses using `gzipEncode` (or similar).
     * Sends data to Supabase via tRPC mutations:

       * `router.activities.create` → inserts the activity row.
       * `router.activityStreams.upsert` → inserts compressed metric streams.
   * Post-sync, `sync_status` is updated to `'synced'`.
   * On successful upload, the local Activity recording is deleted from the local database, and so are the associated metric streams.

---

## 4. tRPC Local → Supabase Sync Workflow

1. **Local Activity Recording**

   * Metrics are stored chunked in `activity_recording_streams`.
   * Route streams (lat/lng, altitude, elevation) are stored in the same table with `metric` differentiating type.
   * Chunks flagged `sync_status='local_only'`.

2. **Finish Recording**

   * Compute aggregates (distance, movingTime, calories, averages, normalized values, etc).
   * Insert final activity row into `activityRecordings` (local SQLite).

3. **tRPC Upload**

   * `ActivityRecorderService.uploadCompletedActivity()`:

     1. Fetch all chunks grouped by metric.
     2. Concatenate raw arrays (data + timestamps).
     3. Compress with `gzipEncode`.
     4. `trpc.activities.create({ ...activityData })`.
     5. `trpc.activityStreams.upsert({ activityId, metric, compressedData, originalSize })`.
   * Update local chunks `synced=true`.

4. **Recovery**

   * If upload fails, chunks remain in local DB.
   * Retry is handled via `SyncManager` hook on network reconnection.

---

## ✅ **Next Steps**

* Implement **full BLE/GPS integration** using `react-native-ble-plx` and `expo-location`.
* Implement **background task management** for long-running recordings.
* Complete **tRPC sync methods** to handle chunked upload and error recovery.
* Add **unit tests** for:

  * Chunk aggregation
  * Compression/decompression
  * Sync failure/retry scenarios
