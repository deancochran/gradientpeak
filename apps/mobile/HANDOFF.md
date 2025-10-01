# 📘 Activity Recorder Augmentation Guide

Updated implementation guide based on your actual codebase structure.

---

## 1. Overview & Current State Analysis

**Your existing architecture:**
- ✅ `ActivityRecorderService` - Central coordinator with lifecycle management
- ✅ `LocationManager` - Foreground + background GPS with TaskManager
- ✅ `SensorsManager` - BLE connection/reconnection with state tracking
- ✅ `PermissionsManager` - Cross-platform permission handling
- ✅ SQLite persistence via Drizzle ORM (`activityRecordings`, `activityRecordingStreams`)
- ✅ Chunk-based buffering with 5s intervals

**Critical gaps:**
- ❌ No Android foreground service wrapper for the recorder itself
- ❌ No AppState handling (sensors/GPS keep running when app backgrounds)
- ❌ No live notification updates with workout metrics
- ❌ Reconnection logic doesn't integrate with AppState transitions
- ❌ `processChunk()` doesn't handle app termination edge cases

---



---

### Phase 5: Robust Chunk Processing

**Enhance `processChunk()` with error recovery:**

```typescript
private async processChunk(): Promise<void> {
  if (!this.recording || !this.lastCheckpointAt) return;

  const endTime = Date.now();
  const streamsToInsert: InsertRecordingStream[] = [];

  try {
    for (const [metric, buffer] of Object.entries(this.sensorDataBuffer)) {
      if (buffer.length === 0) continue;

      const data = buffer.map((item) => item.value);
      const timestamps = buffer.map((item) => item.timestamp);

      const streamData: InsertRecordingStream = {
        activityRecordingId: this.recording.id,
        metric: metric as PublicActivityMetric,
        dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
        chunkIndex: this.chunkIndex,
        startTime: this.lastCheckpointAt,
        endTime: new Date(endTime),
        data: JSON.stringify(data),
        timestamps: JSON.stringify(timestamps),
        sampleCount: buffer.length,
        synced: false,
      };

      streamsToInsert.push(streamData);
    }

    if (streamsToInsert.length > 0) {
      // Use transaction for atomicity
      await localdb.transaction(async (tx) => {
        await tx.insert(activityRecordingStreams).values(streamsToInsert);
      });

      // Only clear buffers after successful DB write
      for (const buffer of Object.values(this.sensorDataBuffer)) {
        buffer.length = 0;
      }

      console.log(`Flushed ${streamsToInsert.length} streams to DB`);
    }

    this.lastCheckpointAt = new Date(endTime);
    this.chunkIndex++;

  } catch (error) {
    console.error('Failed to process chunk, retrying:', error);
    // Retry once after 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      if (streamsToInsert.length > 0) {
        await localdb.insert(activityRecordingStreams).values(streamsToInsert);
        for (const buffer of Object.values(this.sensorDataBuffer)) {
          buffer.length = 0;
        }
      }
    } catch (retryError) {
      console.error('Chunk processing failed after retry:', retryError);
      // Data remains in buffer for next attempt
    }
  }
}
```

---

## 3. Testing Checklist

### Android Doze Mode
```bash
# Test with ADB commands
adb shell dumpsys battery unplug
adb shell dumpsys deviceidle force-idle
# Verify notification persists and GPS/BLE continue
```

### BLE Disconnection
1. Start recording with heart rate monitor
2. Turn off monitor
3. Verify reconnection attempts in logs
4. Turn monitor back on
5. Verify automatic reconnection

### App Termination
1. Start recording
2. Force kill app (swipe away)
3. Reopen app
4. Verify last chunk was saved to DB

### Background Transitions
1. Start recording
2. Background app (home button)
3. Wait 30 seconds
4. Foreground app
5. Verify sensors reconnected and no data gaps

---

## 4. Configuration Changes

**None required** - your `app.config.ts` already has:
- ✅ `WAKE_LOCK`
- ✅ `FOREGROUND_SERVICE`
- ✅ `UIBackgroundModes: ["location", "bluetooth-central"]`

Just add `expo-notifications` to dependencies.

---

## 5. Priority Implementation Order

1. **Foreground Service** (Phase 1) - Critical for Android reliability
2. **AppState Handling** (Phase 2) - Prevents battery drain and stale connections
3. **Chunk Processing Robustness** (Phase 5) - Prevents data loss
4. **Live Notifications** (Phase 3) - User experience enhancement
5. **BLE Reconnection Polish** (Phase 4) - Already mostly working
