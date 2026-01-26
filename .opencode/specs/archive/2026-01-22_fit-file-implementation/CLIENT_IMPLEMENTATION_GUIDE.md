# Technical Specification: Real-Time FIT File Encoding

This document outlines the best practices for creating FIT files in real-time on a client mobile application using the `@garmin/fitsdk` JavaScript SDK. It covers the complete lifecycle of an activity recording, from initialization to finalization, with special considerations for pool swim activities.

---

## 1. File Initialization

Every FIT file, regardless of activity type, must begin with a specific sequence of messages to ensure it is valid and recognized by Garmin Connect and other platforms. These messages should be written immediately upon starting a new recording session.

The required initialization sequence is:

1.  `FILE_ID`
2.  `DEVICE_INFO`
3.  `EVENT` (Timer Start)

```typescript
import { Encoder, Profile, Utils } from "@garmin/fitsdk";

// Initialize the encoder for a new activity
const encoder = new Encoder();
const startTime = new Date();
const fitStartTime = Utils.convertDateToDateTime(startTime);

// 1. FILE_ID Message (Required, exactly one)
// Defines the file type and creator.
encoder.writeMesg({
  mesgNum: Profile.MesgNum.FILE_ID,
  type: "activity", // This is an activity file
  manufacturer: "gradientpeak", // Your registered manufacturer name
  product: 1, // Your product ID
  timeCreated: fitStartTime,
  serialNumber: "YOUR_UNIQUE_DEVICE_ID", // A unique identifier for the device
});

// 2. DEVICE_INFO Message (Best Practice)
// Describes the device that created the file.
encoder.writeMesg({
  mesgNum: Profile.MesgNum.DEVICE_INFO,
  deviceIndex: "creator",
  manufacturer: "gradientpeak",
  product: 1,
  productName: "GradientPeak Mobile",
  softwareVersion: 1.0,
  timestamp: fitStartTime,
});

// 3. EVENT Message (Timer Start) (Required for valid activities)
// Marks the official start of the timed activity.
encoder.writeMesg({
  mesgNum: Profile.MesgNum.EVENT,
  timestamp: fitStartTime,
  event: "timer",
  eventType: "start",
});

// The encoder is now ready to receive real-time activity data.
```

**Best Practice:**

- The `serialNumber` in the `FILE_ID` message should be a unique identifier for the user's device to aid in debugging and data analysis.
- The `timeCreated` and `timestamp` fields should be UTC timestamps generated using `Utils.convertDateToDateTime(new Date())`.

---

## 2. Real-Time Data Recording

`RECORD` messages form the core of an activity file, representing a snapshot of sensor data at a specific moment in time.

### Writing `Record` Messages

For time-based activities like running or cycling, a `RECORD` message should be written at a regular interval, typically once per second.

```typescript
// Example of writing a single RECORD message
function writeRecordMessage(encoder: Encoder, data: SensorData) {
  const now = new Date();
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.RECORD,
    timestamp: Utils.convertDateToDateTime(now),
    positionLat: data.latitude
      ? Math.round(data.latitude * (2 ** 31 / 180))
      : undefined,
    positionLong: data.longitude
      ? Math.round(data.longitude * (2 ** 31 / 180))
      : undefined,
    distance: data.totalDistance, // in meters
    enhancedSpeed: data.currentSpeed, // in m/s
    heartRate: data.heartRate, // in bpm
    cadence: data.cadence, // in rpm
    // ... other relevant fields like power, altitude, etc.
  });
}
```

### Handling Pauses (Auto-Pause / Manual Pause)

To correctly represent pauses in an activity, you must use `EVENT` messages. This ensures that metrics like `total_timer_time` (moving time) are calculated correctly, distinct from `total_elapsed_time`.

1.  **When the user pauses:** Write an `EVENT` message with `eventType: 'stop'`.
2.  **When the user resumes:** Write an `EVENT` message with `eventType: 'start'`.

```typescript
// User presses the PAUSE button
encoder.writeMesg({
  mesgNum: Profile.MesgNum.EVENT,
  timestamp: Utils.convertDateToDateTime(new Date()),
  event: "timer",
  eventType: "stop", // or "stop_all" to pause all timers
});

// --- Activity is now paused. Do not write RECORD messages during this time. ---

// User presses the RESUME button
encoder.writeMesg({
  mesgNum: Profile.MesgNum.EVENT,
  timestamp: Utils.convertDateToDateTime(new Date()),
  event: "timer",
  eventType: "start",
});
```

**Best Practice:**

- Do **not** write `RECORD` messages while the timer is stopped. The time gap between the `stop` and `start` `EVENT` messages represents the pause.

---

## 3. Pool Swim Specifics

Pool swim activities have a more complex structure. Instead of continuous `RECORD` messages, data is primarily structured around `LENGTH` messages, which are then summarized into `LAP` messages.

### `Length` and `Record` Message Pairing

For pool swims, a `LENGTH` message should be generated every time the user completes a length of the pool. **Crucially, each `LENGTH` message must be paired with a corresponding `RECORD` message.** The `RECORD` message provides the timestamped sensor data at the exact moment the length was completed.

- **Trigger:** The mobile app's logic (using accelerometer data to detect a wall push-off or a stop) should trigger the writing of this pair.
- **Timestamp:** The `timestamp` in both the `LENGTH` and `RECORD` messages for a given length should be identical.

```typescript
// Called at the completion of each active swim length
function writeSwimLength(encoder: Encoder, lengthData: SwimLengthData) {
  const lengthEndTime = new Date();
  const fitLengthEndTime = Utils.convertDateToDateTime(lengthEndTime);

  // 1. Write the LENGTH message
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.LENGTH,
    messageIndex: lengthData.lengthIndex, // Monotonically increasing index (0, 1, 2...)
    timestamp: fitLengthEndTime,
    startTime: Utils.convertDateToDateTime(lengthData.startTime),
    totalElapsedTime:
      (lengthEndTime.getTime() - lengthData.startTime.getTime()) / 1000, // seconds
    totalTimerTime: lengthData.movingTime, // seconds (active swim time for the length)
    lengthType: "active",
    swimStroke: lengthData.strokeType, // e.g., "freestyle", "breaststroke", etc.
    avgSpeed: lengthData.averageSpeed, // m/s
    totalStrokes: lengthData.strokeCount,
  });

  // 2. Write the corresponding RECORD message
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.RECORD,
    timestamp: fitLengthEndTime,
    // Include any available data, even if minimal for indoor swims
    distance: lengthData.totalActivityDistance,
    // Other fields like heart rate can be included if available
  });
}
```

**Best Practice:**

- Rest periods at the wall are implicitly calculated as the time difference between the `timestamp` of one `LENGTH` message and the `startTime` of the next. You do not need to write `LENGTH` messages with `lengthType: 'rest'`.

### `Lap` Message for Swim Sets

A `LAP` message in a pool swim summarizes a set of lengths. It should be written whenever the user manually triggers a lap (e.g., by pressing a "Lap" button after a warm-up, main set, or cool-down).

```typescript
// Called when a swim set (lap) is completed
function writeSwimLap(encoder: Encoder, lapData: SwimLapData) {
  const lapEndTime = new Date();
  const fitLapEndTime = Utils.convertDateToDateTime(lapEndTime);

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.LAP,
    messageIndex: lapData.lapIndex, // Monotonically increasing index (0, 1, 2...)
    timestamp: fitLapEndTime,
    startTime: Utils.convertDateToDateTime(lapData.startTime),
    totalElapsedTime:
      (lapEndTime.getTime() - lapData.startTime.getTime()) / 1000,
    totalTimerTime: lapData.movingTime,
    firstLengthIndex: lapData.firstLengthIndex, // The messageIndex of the first length in this lap
    numLengths: lapData.numberOfLengths,
    totalDistance: lapData.totalDistance,
    avgSpeed: lapData.averageSpeed,
    swimStroke: lapData.dominantStroke,
    // ... other summary fields like avg_heart_rate, total_strokes, etc.
  });
}
```

---

## 4. Drill Mode Implementation

Drill mode is a special case where the user performs a swim drill (e.g., kickboard) that cannot be automatically tracked. The user manually enters the distance upon completion. This is represented by a `LENGTH` message with `lengthType: 'drill'`.

```typescript
// Called after the user completes a drill and enters the distance
function writeDrillLength(encoder: Encoder, drillData: DrillData) {
  const drillEndTime = new Date();
  const fitDrillEndTime = Utils.convertDateToDateTime(drillEndTime);

  // 1. Write the LENGTH message for the drill
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.LENGTH,
    messageIndex: drillData.lengthIndex,
    timestamp: fitDrillEndTime,
    startTime: Utils.convertDateToDateTime(drillData.startTime),
    totalElapsedTime:
      (drillEndTime.getTime() - drillData.startTime.getTime()) / 1000,
    totalTimerTime:
      (drillEndTime.getTime() - drillData.startTime.getTime()) / 1000,
    lengthType: "drill",
    // Note: Fields like swimStroke and totalStrokes are omitted for drills
  });

  // 2. Write the corresponding RECORD message
  // The distance field is updated with the manually entered drill distance
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.RECORD,
    timestamp: fitDrillEndTime,
    distance: drillData.totalActivityDistance, // This now includes the drill distance
  });
}
```

---

## 5. File Finalization

When the user stops the recording, a sequence of summary messages must be written to correctly close out the file. This sequence finalizes the last lap, the overall session, and the activity itself.

The required finalization sequence is:

1.  `EVENT` (Timer Stop)
2.  `LAP` (The final lap)
3.  `SESSION`
4.  `ACTIVITY`

```typescript
// Called when the user presses the STOP and SAVE button
function finalizeActivity(encoder: Encoder, sessionData: SessionData) {
  const endTime = new Date();
  const fitEndTime = Utils.convertDateToDateTime(endTime);
  const localTimestampOffset = endTime.getTimezoneOffset() * -60; // For local_timestamp field

  // 1. EVENT Message (Timer Stop)
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.EVENT,
    timestamp: fitEndTime,
    event: "timer",
    eventType: "stop_all",
  });

  // 2. LAP Message (for the final, unterminated lap)
  // The mobile app must have been tracking the data for this final lap.
  writeFinalLap(encoder, sessionData.lastLapData);

  // 3. SESSION Message (Required, exactly one)
  // Summarizes the entire activity session.
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.SESSION,
    timestamp: fitEndTime,
    startTime: fitStartTime, // The start time from the beginning of the activity
    totalElapsedTime: sessionData.totalElapsedTime,
    totalTimerTime: sessionData.totalTimerTime,
    sport: sessionData.sport, // e.g., "running", "swimming"
    subSport: sessionData.subSport, // e.g., "generic", "lap_swimming"
    firstLapIndex: 0,
    numLaps: sessionData.lapCount,
    totalDistance: sessionData.totalDistance,
    avgSpeed: sessionData.averageSpeed,
    maxSpeed: sessionData.maxSpeed,
    avgHeartRate: sessionData.avgHeartRate,
    maxHeartRate: sessionData.maxHeartRate,
    // ... other summary fields
  });

  // 4. ACTIVITY Message (Required, exactly one)
  // The final message, providing a top-level summary.
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: fitEndTime,
    totalTimerTime: sessionData.totalTimerTime,
    numSessions: 1,
    localTimestamp: fitEndTime + localTimestampOffset,
  });

  // Close the encoder and get the file data
  const fitFile: Uint8Array = encoder.close();

  // Now, save or upload the fitFile data.
}
```
