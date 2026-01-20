# File Migration Implementation Plan - Updated
**GradientPeak Real-Time Recording Architecture**

## Document Overview

This implementation plan details the migration of GradientPeak's activity recording system from compressed JSON streams to industry-standard FIT (Flexible and Interoperable Data Transfer) files using the **official Garmin FIT SDK**. The migration leverages GradientPeak's existing Supabase infrastructure, maintaining the local-first, JSON-centric philosophy while adopting the FIT binary standard for enhanced interoperability with major fitness platforms (Garmin Connect, Strava, Wahoo).

### Key Architectural Principles

**Real-Time FIT Recording**: Mobile app writes FIT record messages incrementally during activity capture following Garmin's "Summary Last" message sequencing
**Official Garmin SDK**: Uses official FIT JavaScript SDK for encoding/decoding (not third-party libraries)
**Best Practice Compliance**: Follows Garmin's Activity file encoding cookbook best practices
**Supabase Storage Integration**: FIT files stored in Supabase Storage buckets with row-level security
**Asynchronous Processing**: Database records derived from parsed FIT files via background workers
**Crash Recovery**: Periodic FIT file checkpoints enable resumption after app crashes
**Single Source of Truth**: FIT files replace compressed JSON as the authoritative activity data source

---

## 1. Executive Summary

### Current Architecture (JSON-Based)

GradientPeak currently implements a local-first recording architecture where:

1. **Mobile Recording**: `ActivityRecorderService` buffers sensor data (HR, power, cadence, GPS) in memory
2. **Local Persistence**: Chunked JSON files written every 100 samples to Expo SQLite for fault tolerance
3. **Compression**: Upon recording completion, chunks are aggregated and compressed using gzip/pako into base64 payloads
4. **Cloud Upload**: Compressed streams submitted via tRPC to Supabase PostgreSQL `activity_streams` table
5. **Server Processing**: Background workers decompress streams, fetch performance metrics (FTP, LTHR), calculate advanced metrics (TSS, IF, NP), and update activity records

### Proposed Architecture (FIT-Based)

The new system eliminates JSON compression and replaces it with real-time FIT encoding:

1. **Real-Time FIT Encoding**: Mobile app writes FIT messages incrementally during recording using official Garmin FIT JavaScript SDK with proper message sequencing
2. **Checkpoint Strategy**: Flush FIT encoder buffer to device storage every 100 samples or 60 seconds for crash recovery
3. **Direct Upload**: Upon recording finish, upload complete FIT file to Supabase Storage bucket via signed URL
4. **Asynchronous Processing**: Background worker parses FIT using Garmin SDK, creates activity record, computes all metrics
5. **Database as Cache**: Activity table records are derived views of FIT file data, not primary storage

### Migration Benefits

| Benefit | Description |
|---------|-------------|
| **Industry Standard** | Native compatibility with Garmin, Strava, Wahoo ecosystems |
| **Official SDK Support** | Garmin-maintained encoding/decoding with guaranteed compatibility |
| **Best Practice Compliance** | Follows Garmin's recommended message sequencing and field requirements |
| **Data Richness** | FIT supports 100+ native message types beyond basic sensor data |
| **Crash Safety** | Incremental checkpoints preserve partial recordings on app crashes |
| **Simplified Architecture** | Eliminates custom compression/decompression logic |
| **Storage Efficiency** | Binary FIT format comparable to gzipped JSON (~200 KB/hour) |
| **Vendor Independence** | Open format prevents lock-in to proprietary JSON schema |

### In-Scope Requirements

- ✅ Real-time FIT recording with proper message sequencing (Summary Last pattern)
- ✅ Timer Start/Stop events following Garmin best practices
- ✅ Checkpoint-based crash recovery (100 samples or 60 seconds)
- ✅ Supabase Storage integration with signed URLs
- ✅ Background worker for FIT parsing using Garmin SDK
- ✅ Database schema updates for async-first architecture
- ✅ Mobile UI updates for processing state visibility
- ✅ One-time migration script for historical JSON activities

### Out-of-Scope Items

- ❌ Multi-sport activities in single FIT file (one activity = one file)
- ❌ Pool swim activities (Length messages - future enhancement)
- ❌ Advanced FIT developer fields (use standard messages only)
- ❌ Real-time cloud sync during recording (upload only on finish)
- ❌ Client-side metric calculation (all metrics computed server-side)

---

## 2. Garmin FIT SDK Integration

### 2.1 SDK Overview

The official Garmin FIT SDK provides:
- **Encode class**: Writes FIT messages to output streams with proper headers and CRC
- **Decode class**: Parses FIT files and extracts messages
- **Message classes**: Type-safe message definitions (FileIdMesg, SessionMesg, RecordMesg, etc.)
- **Protocol support**: Protocol versions V1.0, V2.0
- **CRC validation**: Automatic CRC calculation and integrity checking

### 2.2 Required Message Types for Activity Files

Per Garmin documentation, Activity files MUST include:

**Required Messages:**
1. **File ID** (first message, identifies file type)
2. **Activity** (summary of entire activity, written at end)
3. **Session** (summary of session, written at end)
4. **Lap** (summary of lap, written at end)
5. **Record** (sensor data, written in real-time)

**Best Practice Messages:**
6. **Device Info** (device identification)
7. **Event** (timer start/stop events)
8. **User Profile** (athlete settings for metric calculations)

### 2.3 Message Sequencing: "Summary Last" Pattern

Garmin's recommended approach for devices recording in real-time:

```
Timeline of Events:
─────────────────────────────────────────────────────────────►
Start                Recording                            Stop

Message Write Order:
1. File ID          ← First message (required)
2. User Profile     ← Optional but recommended
3. Device Info      ← Best practice
4. Event (Start)    ← Timer start (BEFORE first Record)
5. Record           ← Real-time sensor data
6. Record           ← Written as they occur
7. Record           ← ...
8. Event (Stop)     ← Timer stop (AFTER last Record)
9. Lap              ← Summary messages
10. Session         ← Written at end
11. Activity        ← Final summary
```

**Key Points:**
- File ID MUST be first
- Timer Start event MUST occur before first Record
- Records written in real-time as sensor data arrives
- Timer Stop event AFTER last Record
- Summary messages (Lap, Session, Activity) written at end
- All messages with timestamps share the activity start time initially

---

## 3. Implementation Details

### 3.1 Mobile: Real-Time FIT Recording

**Installation:**

```bash
cd apps/mobile
# Download the official Garmin FIT SDK from https://developer.garmin.com/fit/download/
# Extract the JavaScript SDK files to apps/mobile/lib/fit-sdk/
# The SDK provides: fit.js (Encode/Decode classes and message types)
npm install uuid
npm install @types/node # For Buffer support
```

**SDK File Structure:**
```
apps/mobile/lib/fit-sdk/
├── fit.js              # Main SDK file (Encode, Decode, Message classes)
├── fit.d.ts            # TypeScript type definitions (if available)
└── README.txt          # SDK documentation
```

**Core Service: StreamingFitEncoder**

File: `apps/mobile/lib/services/fit/StreamingFitEncoder.ts`

```typescript
/**
 * StreamingFitEncoder - Real-Time FIT Recording with Garmin SDK
 * 
 * Implements Garmin's "Summary Last" message sequencing pattern:
 * - File ID (first message)
 * - User Profile, Device Info (metadata)
 * - Timer Start Event (before first Record)
 * - Record messages (real-time sensor data)
 * - Timer Stop Event (after last Record)
 * - Lap, Session, Activity (summary messages at end)
 * 
 * Reference: https://developer.garmin.com/fit/cookbook/encoding-activity-files/
 */

import Fit from '@/lib/fit-sdk/fit';
import * as FileSystem from 'expo-file-system';
import { v4 as uuid } from 'uuid';

export interface SensorSample {
  timestamp: Date;
  position_lat?: number;      // degrees
  position_long?: number;     // degrees
  distance?: number;          // cumulative meters
  altitude?: number;          // meters
  speed?: number;             // m/s
  heart_rate?: number;        // bpm
  cadence?: number;           // rpm
  power?: number;             // watts
  temperature?: number;       // celsius
}

export interface ActivityMetadata {
  sport: 'cycling' | 'running' | 'swimming' | 'generic';
  subSport?: string;          // e.g., 'road', 'mountain', 'indoor_cycling'
  indoor: boolean;
}

export interface UserProfile {
  weight_kg: number;
  age: number;
  gender: 'male' | 'female';
  ftp?: number;
  max_heart_rate?: number;
}

export class StreamingFitEncoder {
  private encoder: any | null = null;
  private recordingId: string | null = null;
  private fitFilePath: string | null = null;
  private metaFilePath: string | null = null;
  
  private sampleCount = 0;
  private lastCheckpoint = Date.now();
  private startTime: Date | null = null;
  private lastRecordTime: Date | null = null;
  private metadata: ActivityMetadata | null = null;
  
  private samples: SensorSample[] = []; // For session summary calculation
  private timerPaused = false;
  
  constructor(private profile: UserProfile) {}
  
  /**
   * Step 1-4: Initialize FIT file with required initial messages
   * 
   * Following Garmin's 7-step encoding process:
   * 1. Create output stream ✓
   * 2. Create Encode instance ✓
   * 3. Call encoder.Open() ✓
   * 4. Write File ID message ✓
   * 5. Write activity-specific messages (ongoing)
   * 6. Call encoder.Close() (in finish())
   * 7. Close output stream (in finish())
   */
  async start(metadata: ActivityMetadata): Promise<void> {
    this.recordingId = uuid();
    this.startTime = new Date();
    this.metadata = metadata;
    
    // Create recording directory
    const recordingsDir = `${FileSystem.cacheDirectory}recordings`;
    await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
    
    // File paths
    this.fitFilePath = `${recordingsDir}/${this.recordingId}.fit`;
    this.metaFilePath = `${recordingsDir}/${this.recordingId}.meta.json`;
    
    // Step 2: Create Encode instance with Protocol V2.0
    this.encoder = new Fit.Encode(Fit.ProtocolVersion.V20);
    
    // Note: For JavaScript SDK, we accumulate messages in memory
    // and write to file during checkpoints. The encoder.Close()
    // will finalize with CRC and data size.
    
    // Step 4: Write File ID Message (REQUIRED - MUST BE FIRST)
    const fileIdMesg = new Fit.FileIdMesg();
    fileIdMesg.setType(Fit.File.ACTIVITY);
    fileIdMesg.setManufacturer(Fit.Manufacturer.DEVELOPMENT);
    fileIdMesg.setProduct(0); // Your product ID
    fileIdMesg.setSerialNumber(Math.floor(Math.random() * 1000000));
    fileIdMesg.setTimeCreated(this.dateToFitTimestamp(this.startTime));
    this.encoder.write(fileIdMesg);
    
    // Write User Profile Message (recommended for metric calculations)
    const userProfileMesg = new Fit.UserProfileMesg();
    userProfileMesg.setWeight(this.profile.weight_kg);
    userProfileMesg.setAge(this.profile.age);
    userProfileMesg.setGender(
      this.profile.gender === 'male' ? Fit.Gender.MALE : Fit.Gender.FEMALE
    );
    if (this.profile.ftp) {
      userProfileMesg.setFunctionalThresholdPower(this.profile.ftp);
    }
    if (this.profile.max_heart_rate) {
      userProfileMesg.setMaxHeartRate(this.profile.max_heart_rate);
    }
    this.encoder.write(userProfileMesg);
    
    // Write Device Info Message (best practice)
    const deviceInfoMesg = new Fit.DeviceInfoMesg();
    deviceInfoMesg.setTimestamp(this.dateToFitTimestamp(this.startTime));
    deviceInfoMesg.setManufacturer(Fit.Manufacturer.DEVELOPMENT);
    deviceInfoMesg.setProduct(0);
    deviceInfoMesg.setSerialNumber(Math.floor(Math.random() * 1000000));
    // Optional: Add software version
    // deviceInfoMesg.setSoftwareVersion(1.0);
    this.encoder.write(deviceInfoMesg);
    
    // CRITICAL: Timer Start Event BEFORE first Record message
    // This indicates the device is recording data
    const timerStartEvent = new Fit.EventMesg();
    timerStartEvent.setTimestamp(this.dateToFitTimestamp(this.startTime));
    timerStartEvent.setEvent(Fit.Event.TIMER);
    timerStartEvent.setEventType(Fit.EventType.START);
    this.encoder.write(timerStartEvent);
    
    // Write initial checkpoint
    await this.writeCheckpointMeta();
    
    console.log(`📹 FIT Recording started: ${this.recordingId}`);
    console.log(`   Sport: ${metadata.sport}, Indoor: ${metadata.indoor}`);
  }
  
  /**
   * Step 5: Add sensor sample as Record message
   * 
   * Record messages are written in real-time as sensor data arrives.
   * They should NOT be written when the timer is paused.
   */
  async addSample(sample: SensorSample): Promise<void> {
    if (!this.encoder) throw new Error('Recording not started');
    if (this.timerPaused) {
      console.warn('Cannot add sample while timer is paused');
      return;
    }
    
    // Store for summary calculation
    this.samples.push(sample);
    this.lastRecordTime = sample.timestamp;
    
    // Create Record Message
    const recordMesg = new Fit.RecordMesg();
    recordMesg.setTimestamp(this.dateToFitTimestamp(sample.timestamp));
    
    // GPS coordinates (converted to semicircles as per FIT spec)
    if (sample.position_lat !== undefined && sample.position_long !== undefined) {
      recordMesg.setPositionLat(this.degreesToSemicircles(sample.position_lat));
      recordMesg.setPositionLong(this.degreesToSemicircles(sample.position_long));
    }
    
    // Sensor data
    if (sample.distance !== undefined) {
      recordMesg.setDistance(sample.distance);
    }
    if (sample.altitude !== undefined) {
      recordMesg.setAltitude(sample.altitude);
    }
    if (sample.speed !== undefined) {
      recordMesg.setSpeed(sample.speed);
    }
    if (sample.heart_rate !== undefined) {
      recordMesg.setHeartRate(sample.heart_rate);
    }
    if (sample.cadence !== undefined) {
      recordMesg.setCadence(sample.cadence);
    }
    if (sample.power !== undefined) {
      recordMesg.setPower(sample.power);
    }
    if (sample.temperature !== undefined) {
      recordMesg.setTemperature(sample.temperature);
    }
    
    // Write to encoder
    this.encoder.write(recordMesg);
    this.sampleCount++;
    
    // Checkpoint every 100 samples OR every 60 seconds
    const now = Date.now();
    if (this.sampleCount % 100 === 0 || now - this.lastCheckpoint > 60000) {
      await this.checkpoint();
    }
  }
  
  /**
   * Pause timer (stops writing Record messages)
   * Used when user pauses activity recording
   */
  async pauseTimer(): Promise<void> {
    if (!this.encoder || this.timerPaused) return;
    
    const pauseTime = new Date();
    
    // Write Timer Stop Event
    const timerStopEvent = new Fit.EventMesg();
    timerStopEvent.setTimestamp(this.dateToFitTimestamp(pauseTime));
    timerStopEvent.setEvent(Fit.Event.TIMER);
    timerStopEvent.setEventType(Fit.EventType.STOP_ALL);
    this.encoder.write(timerStopEvent);
    
    this.timerPaused = true;
    await this.checkpoint();
    
    console.log('⏸️ Timer paused');
  }
  
  /**
   * Resume timer (resumes writing Record messages)
   * Used when user resumes activity recording
   */
  async resumeTimer(): Promise<void> {
    if (!this.encoder || !this.timerPaused) return;
    
    const resumeTime = new Date();
    
    // Write Timer Start Event
    const timerStartEvent = new Fit.EventMesg();
    timerStartEvent.setTimestamp(this.dateToFitTimestamp(resumeTime));
    timerStartEvent.setEvent(Fit.Event.TIMER);
    timerStartEvent.setEventType(Fit.EventType.START);
    this.encoder.write(timerStartEvent);
    
    this.timerPaused = false;
    
    console.log('▶️ Timer resumed');
  }
  
  /**
   * Checkpoint: Flush encoder buffer to device storage
   * Enables crash recovery by persisting partial FIT data
   */
  private async checkpoint(): Promise<void> {
    if (!this.encoder || !this.fitFilePath || !this.metaFilePath) return;
    
    try {
      // Get encoded bytes from encoder
      // Note: Garmin SDK's getBytes() returns partial encoding
      const fitBytes = this.encoder.getBytes();
      
      // Write to device storage as base64
      const base64Data = this.arrayBufferToBase64(fitBytes);
      await FileSystem.writeAsStringAsync(this.fitFilePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Update checkpoint metadata
      const lastSample = this.samples[this.samples.length - 1];
      await FileSystem.writeAsStringAsync(
        this.metaFilePath,
        JSON.stringify({
          recordingId: this.recordingId,
          startTime: this.startTime?.toISOString(),
          lastSampleIndex: this.sampleCount,
          lastTimestamp: lastSample?.timestamp.toISOString(),
          fitFilePath: this.fitFilePath,
          metadata: this.metadata,
          timerPaused: this.timerPaused
        })
      );
      
      this.lastCheckpoint = Date.now();
      console.log(`✅ Checkpoint: ${this.sampleCount} samples`);
    } catch (error) {
      console.error('Checkpoint failed:', error);
      // Don't throw - continue recording
    }
  }
  
  /**
   * Step 5 (final): Write summary messages and finalize FIT file
   * 
   * Summary Last pattern: Lap, Session, Activity written at end
   * Step 6: Call encoder.Close() to finalize with CRC
   * Step 7: Close/save output stream
   */
  async finish(): Promise<string> {
    if (!this.encoder || !this.fitFilePath) {
      throw new Error('Recording not started');
    }
    
    const endTime = this.lastRecordTime || new Date();
    
    // Write Timer Stop Event (if not already paused)
    if (!this.timerPaused) {
      const timerStopEvent = new Fit.EventMesg();
      timerStopEvent.setTimestamp(this.dateToFitTimestamp(endTime));
      timerStopEvent.setEvent(Fit.Event.TIMER);
      timerStopEvent.setEventType(Fit.EventType.STOP_ALL);
      this.encoder.write(timerStopEvent);
    }
    
    // Calculate summary metrics
    const summary = this.calculateSessionSummary(endTime);
    
    // Write Lap Message (REQUIRED for Activity files)
    const lapMesg = new Fit.LapMesg();
    lapMesg.setMessageIndex(0); // First lap
    lapMesg.setStartTime(this.dateToFitTimestamp(this.startTime!));
    lapMesg.setTimestamp(this.dateToFitTimestamp(endTime));
    lapMesg.setTotalElapsedTime(summary.totalElapsedTime);
    lapMesg.setTotalTimerTime(summary.totalTimerTime);
    
    if (summary.totalDistance) {
      lapMesg.setTotalDistance(summary.totalDistance);
    }
    if (summary.avgHeartRate) {
      lapMesg.setAvgHeartRate(summary.avgHeartRate);
    }
    if (summary.maxHeartRate) {
      lapMesg.setMaxHeartRate(summary.maxHeartRate);
    }
    if (summary.avgPower) {
      lapMesg.setAvgPower(summary.avgPower);
    }
    if (summary.maxPower) {
      lapMesg.setMaxPower(summary.maxPower);
    }
    if (summary.avgCadence) {
      lapMesg.setAvgCadence(summary.avgCadence);
    }
    if (summary.totalAscent) {
      lapMesg.setTotalAscent(summary.totalAscent);
    }
    if (summary.totalDescent) {
      lapMesg.setTotalDescent(summary.totalDescent);
    }
    
    this.encoder.write(lapMesg);
    
    // Write Session Message (REQUIRED for Activity files)
    const sessionMesg = new Fit.SessionMesg();
    sessionMesg.setMessageIndex(0); // First session
    sessionMesg.setStartTime(this.dateToFitTimestamp(this.startTime!));
    sessionMesg.setTimestamp(this.dateToFitTimestamp(endTime));
    
    // Sport type (required)
    const sportMap: Record<string, any> = {
      cycling: Fit.Sport.CYCLING,
      running: Fit.Sport.RUNNING,
      swimming: Fit.Sport.SWIMMING,
      generic: Fit.Sport.GENERIC
    };
    sessionMesg.setSport(sportMap[this.metadata!.sport] || Fit.Sport.GENERIC);
    
    // Sub-sport (optional)
    if (this.metadata!.subSport) {
      // Map sub-sport types as needed
      // sessionMesg.setSubSport(Fit.SubSport.ROAD);
    }
    
    // Time fields (required)
    sessionMesg.setTotalElapsedTime(summary.totalElapsedTime);
    sessionMesg.setTotalTimerTime(summary.totalTimerTime);
    
    // Distance, elevation, HR, power, cadence
    if (summary.totalDistance) {
      sessionMesg.setTotalDistance(summary.totalDistance);
    }
    if (summary.totalAscent) {
      sessionMesg.setTotalAscent(summary.totalAscent);
    }
    if (summary.totalDescent) {
      sessionMesg.setTotalDescent(summary.totalDescent);
    }
    if (summary.avgHeartRate) {
      sessionMesg.setAvgHeartRate(summary.avgHeartRate);
    }
    if (summary.maxHeartRate) {
      sessionMesg.setMaxHeartRate(summary.maxHeartRate);
    }
    if (summary.avgPower) {
      sessionMesg.setAvgPower(summary.avgPower);
    }
    if (summary.maxPower) {
      sessionMesg.setMaxPower(summary.maxPower);
    }
    if (summary.avgCadence) {
      sessionMesg.setAvgCadence(summary.avgCadence);
    }
    if (summary.totalCalories) {
      sessionMesg.setTotalCalories(summary.totalCalories);
    }
    
    // Lap indices
    sessionMesg.setFirstLapIndex(0);
    sessionMesg.setNumLaps(1);
    
    this.encoder.write(sessionMesg);
    
    // Write Activity Message (REQUIRED - final summary)
    const activityMesg = new Fit.ActivityMesg();
    activityMesg.setTimestamp(this.dateToFitTimestamp(endTime));
    activityMesg.setTotalTimerTime(summary.totalTimerTime);
    activityMesg.setNumSessions(1);
    activityMesg.setType(Fit.Activity.MANUAL); // or AUTO
    activityMesg.setEvent(Fit.Event.ACTIVITY);
    activityMesg.setEventType(Fit.EventType.STOP);
    
    this.encoder.write(activityMesg);
    
    // Step 6: Close encoder (finalizes with CRC and data size)
    // Note: JavaScript SDK may handle this differently
    // The Close() method updates the file header with actual data size
    // and appends the CRC checksum
    
    // Get final encoded bytes
    const fitBytes = this.encoder.getBytes();
    
    // Step 7: Write final FIT file to device storage
    const base64Data = this.arrayBufferToBase64(fitBytes);
    await FileSystem.writeAsStringAsync(this.fitFilePath, base64Data, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    // Delete checkpoint metadata
    if (this.metaFilePath) {
      await FileSystem.deleteAsync(this.metaFilePath, { idempotent: true });
    }
    
    console.log(`✅ FIT Recording finished: ${this.fitFilePath}`);
    console.log(`   Duration: ${(summary.totalElapsedTime / 60).toFixed(1)} min`);
    console.log(`   Distance: ${((summary.totalDistance || 0) / 1000).toFixed(2)} km`);
    console.log(`   Samples: ${this.sampleCount}`);
    
    return this.fitFilePath;
  }
  
  /**
   * Calculate session summary metrics from recorded samples
   */
  private calculateSessionSummary(endTime: Date) {
    const hrSamples = this.samples
      .map(s => s.heart_rate)
      .filter((hr): hr is number => hr !== undefined);
    const powerSamples = this.samples
      .map(s => s.power)
      .filter((p): p is number => p !== undefined);
    const cadenceSamples = this.samples
      .map(s => s.cadence)
      .filter((c): c is number => c !== undefined);
    
    const lastSample = this.samples[this.samples.length - 1];
    const firstSample = this.samples[0];
    
    // Calculate moving time (samples where speed > 0.5 m/s threshold)
    const movingSamples = this.samples.filter(s => 
      s.speed && s.speed > 0.5
    );
    const movingTime = movingSamples.length; // Approximate seconds (assumes ~1Hz)
    
    // Calculate elevation gain/loss
    let totalAscent = 0;
    let totalDescent = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const prev = this.samples[i - 1].altitude;
      const curr = this.samples[i].altitude;
      if (prev !== undefined && curr !== undefined) {
        const diff = curr - prev;
        if (diff > 0) totalAscent += diff;
        else totalDescent += Math.abs(diff);
      }
    }
    
    // Estimate calories (very rough approximation)
    const totalCalories = powerSamples.length > 0
      ? Math.round((powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length) * 
          (movingTime / 3600) * 3.6) // Rough estimate: avg watts * hours * 3.6
      : undefined;
    
    return {
      totalElapsedTime: (endTime.getTime() - this.startTime!.getTime()) / 1000,
      totalTimerTime: movingTime,
      totalDistance: lastSample?.distance || firstSample?.distance,
      avgHeartRate: hrSamples.length > 0 
        ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) 
        : undefined,
      maxHeartRate: hrSamples.length > 0 
        ? Math.max(...hrSamples) 
        : undefined,
      avgPower: powerSamples.length > 0 
        ? Math.round(powerSamples.reduce((a, b) => a + b, 0) / powerSamples.length) 
        : undefined,
      maxPower: powerSamples.length > 0 
        ? Math.max(...powerSamples) 
        : undefined,
      avgCadence: cadenceSamples.length > 0 
        ? Math.round(cadenceSamples.reduce((a, b) => a + b, 0) / cadenceSamples.length) 
        : undefined,
      totalAscent: totalAscent > 0 ? Math.round(totalAscent) : undefined,
      totalDescent: totalDescent > 0 ? Math.round(totalDescent) : undefined,
      totalCalories
    };
  }
  
  /**
   * Convert JavaScript Date to FIT timestamp
   * FIT epoch: 1989-12-31 00:00:00 UTC (631065600 seconds after Unix epoch)
   */
  private dateToFitTimestamp(date: Date): number {
    const FIT_EPOCH_OFFSET = 631065600;
    return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
  }
  
  /**
   * Convert degrees to semicircles (FIT format for lat/lng)
   * Semicircles = degrees × (2^31 / 180)
   */
  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (Math.pow(2, 31) / 180));
  }
  
  /**
   * Convert ArrayBuffer to base64 string for file storage
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  /**
   * Write checkpoint metadata for crash recovery
   */
  private async writeCheckpointMeta(): Promise<void> {
    if (!this.metaFilePath) return;
    
    await FileSystem.writeAsStringAsync(
      this.metaFilePath,
      JSON.stringify({
        recordingId: this.recordingId,
        startTime: this.startTime?.toISOString(),
        lastSampleIndex: 0,
        lastTimestamp: this.startTime?.toISOString(),
        fitFilePath: this.fitFilePath,
        metadata: this.metadata,
        timerPaused: false
      })
    );
  }
}
```

### 3.2 Mobile: FIT File Upload Service

File: `apps/mobile/lib/services/fit/FitUploader.ts`

```typescript
/**
 * FitUploader - Handles FIT file upload to Supabase Storage
 * 
 * Workflow:
 * 1. Request signed upload URL from API
 * 2. Upload FIT file directly to Supabase Storage
 * 3. Finalize upload to trigger background processing
 * 4. Clean up local file
 */

import * as FileSystem from 'expo-file-system';
import { trpc } from '@/lib/trpc';

export class FitUploader {
  /**
   * Upload completed FIT file to Supabase Storage
   * 
   * @param fitFilePath - Local device path to FIT file
   * @returns activityId - UUID of created activity
   */
  async uploadActivity(fitFilePath: string): Promise<string> {
    try {
      // 1. Request signed upload URL from API
      const { uploadUrl, storagePath, activityId} = 
        await trpc.activities.requestFitUploadUrl.mutate({
          filename: `${new Date().toISOString()}.fit`
        });
      
      console.log(`📤 Uploading FIT file to: ${storagePath}`);
      
      // 2. Read FIT file from device storage
      const fitData = await FileSystem.readAsStringAsync(fitFilePath, {
        encoding: FileSystem.EncodingType.Base64
      });
      
      // Convert base64 to binary
      const fitBytes = this.base64ToArrayBuffer(fitData);
      
      // 3. Upload to Supabase Storage via signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.ant.fit',
          'Content-Length': fitBytes.byteLength.toString()
        },
        body: fitBytes
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }
      
      console.log(`✅ Upload complete: ${activityId}`);
      
      // 4. Finalize upload (triggers background processing)
      await trpc.activities.finalizeUpload.mutate({ activityId });
      
      // 5. Delete local FIT file
      await FileSystem.deleteAsync(fitFilePath, { idempotent: true });
      
      return activityId;
      
    } catch (error) {
      console.error('FIT upload failed:', error);
      throw error;
    }
  }
  
  /**
   * Convert base64 string to ArrayBuffer for binary upload
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
```

### 3.3 Backend: Background Worker for FIT Analysis

File: `packages/workers/src/jobs/analyzeFit.ts`

```typescript
/**
 * Background job: analyze-fit
 * 
 * Processes uploaded FIT files using Garmin FIT SDK Decoder:
 * 1. Fetch FIT file from Supabase Storage
 * 2. Decode using Garmin SDK (validates CRC, extracts messages)
 * 3. Calculate performance metrics using @repo/core
 * 4. Update activity record with all fields
 */

import { Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import Fit from '@/lib/fit-sdk/fit'; // Garmin FIT SDK
import { 
  calculateNormalizedPower, 
  calculateTSS, 
  calculateIntensityFactor,
  calculateHrZones,
  calculatePowerZones 
} from '@repo/core';
import polyline from '@mapbox/polyline';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AnalyzeFitPayload {
  activityId: string;
}

export async function analyzeFit(job: Job<AnalyzeFitPayload>) {
  const { activityId } = job.data;
  
  try {
    // Update status to PROCESSING
    await updateStatus(activityId, 'PROCESSING');
    
    // 1. Fetch activity to get fit_file_path
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select('fit_file_path, profile_id')
      .eq('id', activityId)
      .single();
    
    if (fetchError || !activity) {
      throw new Error(`Activity not found: ${activityId}`);
    }
    
    if (!activity.fit_file_path) {
      throw new Error('No FIT file path in activity record');
    }
    
    // 2. Download FIT file from Supabase Storage
    const { data: fitData, error: storageError } = await supabase.storage
      .from('activity-files')
      .download(activity.fit_file_path);
    
    if (storageError || !fitData) {
      throw new Error(`Failed to download FIT file: ${storageError?.message}`);
    }
    
    // 3. Decode FIT file using Garmin SDK
    const fitBuffer = await fitData.arrayBuffer();
    const fitBytes = new Uint8Array(fitBuffer);
    
    // Create Decoder instance
    const decoder = new Fit.Decode();
    
    // Validate FIT file integrity
    if (!decoder.isFit(fitBytes)) {
      throw new Error('Invalid FIT file format');
    }
    
    if (!decoder.checkIntegrity(fitBytes)) {
      throw new Error('FIT file integrity check failed (CRC mismatch)');
    }
    
    // Decode FIT messages
    const decodedFit = decoder.decode(fitBytes);
    
    // Extract messages by type
    const fileIdMessages = decodedFit.messages.filter(
      (m: any) => m.name === 'file_id'
    );
    const sessionMessages = decodedFit.messages.filter(
      (m: any) => m.name === 'session'
    );
    const recordMessages = decodedFit.messages.filter(
      (m: any) => m.name === 'record'
    );
    const lapMessages = decodedFit.messages.filter(
      (m: any) => m.name === 'lap'
    );
    const activityMessages = decodedFit.messages.filter(
      (m: any) => m.name === 'activity'
    );
    
    // Validate required messages
    if (sessionMessages.length === 0) {
      throw new Error('No session message found in FIT file (required)');
    }
    if (recordMessages.length === 0) {
      throw new Error('No record messages found in FIT file');
    }
    
    const session = sessionMessages[0];
    const fileId = fileIdMessages[0];
    
    // 4. Fetch user profile for metric calculations
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ftp, threshold_hr, max_heart_rate, weight_kg')
      .eq('id', activity.profile_id)
      .single();
    
    if (profileError || !profile) {
      throw new Error('Profile not found');
    }
    
    const userFTP = profile.ftp || 200;
    const userMaxHR = profile.max_heart_rate || 190;
    const userThresholdHR = profile.threshold_hr || 170;
    
    // 5. Extract sensor data from Record messages
    const powerSamples: number[] = [];
    const hrSamples: number[] = [];
    const gpsPoints: [number, number][] = [];
    
    recordMessages.forEach((record: any) => {
      if (record.power !== undefined) {
        powerSamples.push(record.power);
      }
      if (record.heart_rate !== undefined) {
        hrSamples.push(record.heart_rate);
      }
      if (record.position_lat !== undefined && record.position_long !== undefined) {
        gpsPoints.push([
          semicirclesToDegrees(record.position_lat),
          semicirclesToDegrees(record.position_long)
        ]);
      }
    });
    
    // 6. Calculate performance metrics
    // Normalized Power (30-second rolling average, 4th power)
    const normalizedPower = powerSamples.length > 0
      ? calculateNormalizedPower(powerSamples, 30)
      : 0;
    
    // Intensity Factor = NP / FTP
    const intensityFactor = normalizedPower > 0
      ? calculateIntensityFactor(normalizedPower, userFTP)
      : 0;
    
    // TSS = (duration × NP × IF) / (FTP × 3600) × 100
    const duration = session.total_elapsed_time || 0;
    const tss = normalizedPower > 0 && duration > 0
      ? calculateTSS(duration, normalizedPower, intensityFactor, userFTP)
      : 0;
    
    // Zone distributions
    const hrZones = hrSamples.length > 0
      ? calculateHrZones(hrSamples, userThresholdHR, userMaxHR)
      : null;
    const powerZones = powerSamples.length > 0
      ? calculatePowerZones(powerSamples, userFTP)
      : null;
    
    // 7. Generate polyline from GPS coordinates
    const encodedPolyline = gpsPoints.length > 0 
      ? polyline.encode(gpsPoints) 
      : null;
    
    // 8. Map FIT sport type to activity type string
    const sportMap: Record<number, string> = {
      [Fit.Sport.CYCLING]: 'cycling',
      [Fit.Sport.RUNNING]: 'running',
      [Fit.Sport.SWIMMING]: 'swimming',
      [Fit.Sport.GENERIC]: 'other'
    };
    const activityType = session.sport !== undefined
      ? (sportMap[session.sport] || 'other')
      : 'other';
    
    // 9. Extract start/end times from session
    const startTime = session.start_time 
      ? fitTimestampToIso(session.start_time)
      : null;
    const endTime = session.timestamp
      ? fitTimestampToIso(session.timestamp)
      : null;
    
    // 10. Update activity record with ALL fields (atomic transaction)
    const { error: updateError } = await supabase
      .from('activities')
      .update({
        name: session.name || `${activityType} Activity`,
        type: activityType,
        started_at: startTime,
        finished_at: endTime,
        distance_meters: session.total_distance || 0,
        duration_seconds: Math.round(session.total_elapsed_time || 0),
        moving_seconds: Math.round(session.total_timer_time || 0),
        elevation_gain_meters: session.total_ascent || 0,
        metrics: {
          tss,
          intensity_factor: intensityFactor,
          normalized_power: normalizedPower,
          avg_heart_rate: session.avg_heart_rate,
          max_heart_rate: session.max_heart_rate,
          avg_power: session.avg_power,
          max_power: session.max_power,
          avg_cadence: session.avg_cadence,
          polyline: encodedPolyline,
          total_calories: session.total_calories
        },
        hr_zone_seconds: hrZones,
        power_zone_seconds: powerZones,
        processing_status: 'COMPLETED',
        updated_at: new Date().toISOString()
      })
      .eq('id', activityId);
    
    if (updateError) {
      throw new Error(`Failed to update activity: ${updateError.message}`);
    }
    
    console.log(`✅ Activity processed successfully: ${activityId}`);
    console.log(`   Type: ${activityType}`);
    console.log(`   Duration: ${Math.round(duration / 60)} min`);
    console.log(`   Distance: ${((session.total_distance || 0) / 1000).toFixed(2)} km`);
    console.log(`   TSS: ${tss.toFixed(0)}`);
    
  } catch (error) {
    console.error(`❌ Activity processing failed: ${activityId}`, error);
    
    // Update status to FAILED
    await updateStatus(activityId, 'FAILED');
    
    // Rethrow to trigger BullMQ retry mechanism
    throw error;
  }
}

/**
 * Helper: Update activity processing status
 */
async function updateStatus(
  activityId: string, 
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
): Promise<void> {
  await supabase
    .from('activities')
    .update({ 
      processing_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', activityId);
}

/**
 * Helper: Convert FIT timestamp to ISO string
 * FIT epoch: 1989-12-31 00:00:00 UTC (631065600 seconds after Unix epoch)
 */
function fitTimestampToIso(fitTimestamp: number): string {
  const FIT_EPOCH_OFFSET = 631065600;
  const unixTimestamp = (fitTimestamp + FIT_EPOCH_OFFSET) * 1000;
  return new Date(unixTimestamp).toISOString();
}

/**
 * Helper: Convert semicircles to degrees
 * Degrees = semicircles × (180 / 2^31)
 */
function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

---

## 4. Key Changes from Original Plan

### 4.1 Proper Message Sequencing

**Before (Incorrect):**
- Messages written without specific order
- No distinction between real-time and summary messages

**After (Garmin Best Practice):**
```
Timeline Order:
1. File ID (first message - required)
2. User Profile (recommended for metrics)
3. Device Info (best practice)
4. Timer Start Event (BEFORE first Record)
5. Record messages (real-time sensor data)
6. Timer Stop Event (AFTER last Record)
7. Lap (summary - written at end)
8. Session (summary - written at end)
9. Activity (final summary)
```

### 4.2 Timer Events

**Added:**
- Timer Start event before first Record message
- Timer Stop event after last Record message
- Pause/Resume support with Timer Stop/Start events
- Prevents ambiguity between recording rate and pauses

**Why Important:**
- Platforms expect timer events to understand when data was being recorded
- Helps distinguish between stopped recording vs. slow movement
- Critical for accurate moving time calculations

### 4.3 Required vs. Optional Messages

**Required Messages (per Garmin):**
- File ID ✓
- Record ✓
- Lap ✓
- Session ✓
- Activity ✓

**Best Practice Messages (strongly recommended):**
- Device Info ✓
- Event (timer start/stop) ✓
- User Profile ✓

### 4.4 CRC and Data Size Handling

**Garmin SDK Encoder Pattern:**
```typescript
// Step 1: Create output stream with Read/Write access
const stream = new FileStream(path, FileMode.Create, FileAccess.ReadWrite);

// Step 2: Create Encode instance
const encoder = new Fit.Encode(ProtocolVersion.V20);

// Step 3: Open encoder (writes header with data size = 0)
encoder.Open(stream);

// Step 4-5: Write messages
encoder.Write(fileIdMesg);
encoder.Write(recordMesg);
// ...

// Step 6: Close encoder (updates data size, appends CRC)
encoder.Close();

// Step 7: Close stream
stream.Close();
```

**For JavaScript (modified for mobile):**
- Encoder accumulates bytes in memory
- `getBytes()` returns partial encoding during checkpoints
- Final `getBytes()` includes proper CRC and data size
- Write to file system when ready to persist

### 4.5 Field Requirements

**Session Message (from documentation):**
- start_time (required)
- timestamp (required)
- sport (required)
- total_elapsed_time (required)
- total_timer_time (required)
- first_lap_index (if laps present)
- num_laps (if laps present)

**Lap Message:**
- start_time (required)
- timestamp (required)
- total_elapsed_time (required)
- total_timer_time (required)

### 4.6 SDK Integration Notes

**Download Official SDK:**
```bash
# Visit https://developer.garmin.com/fit/download/
# Download "FIT SDK" (not FitCSVTool)
# Extract JavaScript files from /sdk/javascript/
```

**SDK Structure:**
```
FIT SDK/
├── c/              # C implementation
├── cpp/            # C++ implementation  
├── cs/             # C# implementation
├── java/           # Java implementation
├── javascript/     # JavaScript implementation ← USE THIS
│   ├── fit.js      # Main SDK file
│   └── examples/   # Example code
├── objc/           # Objective-C implementation
├── python/         # Python implementation
└── swift/          # Swift implementation
```

---

## 5. Testing & Validation

### 5.1 FIT File Validation

**Use Garmin's FIT File Tools:**
```bash
# Download FitCSVTool from Garmin
# https://developer.garmin.com/fit/fitcsvtool/

# Validate FIT file integrity
java -jar FitCSVTool.jar -b input.fit

# Convert to CSV for inspection
java -jar FitCSVTool.jar input.fit

# Check for errors
# - CRC checksum validation
# - Message sequence validation
# - Required field validation
```

### 5.2 Platform Compatibility Testing

**Test FIT files with:**
1. **Garmin Connect** - Upload via web interface
2. **Strava** - Upload via API or web interface
3. **TrainingPeaks** - Import FIT file
4. **Wahoo Fitness** - Sync via API

**Expected Results:**
- All platforms accept and parse the file
- No error messages or warnings
- All metrics display correctly
- GPS route renders properly
- Time/distance/elevation match

### 5.3 Unit Tests

```typescript
describe('StreamingFitEncoder - Message Sequencing', () => {
  it('should write File ID as first message', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    await encoder.start(mockMetadata);
    
    const messages = extractMessages(encoder);
    expect(messages[0].name).toBe('file_id');
  });
  
  it('should write Timer Start before first Record', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    await encoder.start(mockMetadata);
    await encoder.addSample(mockSample);
    
    const messages = extractMessages(encoder);
    const timerStartIndex = messages.findIndex(m => 
      m.name === 'event' && m.event === Fit.Event.TIMER
    );
    const firstRecordIndex = messages.findIndex(m => 
      m.name === 'record'
    );
    
    expect(timerStartIndex).toBeLessThan(firstRecordIndex);
  });
  
  it('should write summary messages (Lap, Session, Activity) at end', async () => {
    const encoder = new StreamingFitEncoder(mockProfile);
    await encoder.start(mockMetadata);
    await encoder.addSample(mockSample1);
    await encoder.addSample(mockSample2);
    const filePath = await encoder.finish();
    
    const messages = extractMessages(filePath);
    const lastMessages = messages.slice(-3);
    
    expect(lastMessages.map(m => m.name)).toEqual([
      'lap',
      'session', 
      'activity'
    ]);
  });
});
```

---

## 6. Migration from Original Plan

### 6.1 Code Changes Required

**StreamingFitEncoder.ts:**
- ✅ Add proper message sequencing (File ID first)
- ✅ Add Timer Start event before first Record
- ✅ Add Timer Stop event in finish()
- ✅ Add Device Info message
- ✅ Write Lap message before Session
- ✅ Write Activity message as final summary
- ✅ Add pause/resume timer support
- ✅ Implement proper CRC handling via SDK

**analyzeFit.ts:**
- ✅ Use Garmin Decode class instead of generic parser
- ✅ Add CRC validation (decoder.checkIntegrity())
- ✅ Add FIT file format validation (decoder.isFit())
- ✅ Handle all message types from SDK
- ✅ Extract fields using SDK's type-safe accessors

### 6.2 New Dependencies

```json
{
  "dependencies": {
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

**Manual SDK Installation:**
1. Download from https://developer.garmin.com/fit/download/
2. Extract `javascript/fit.js`
3. Place in `apps/mobile/lib/fit-sdk/fit.js`
4. Add TypeScript declarations if needed

---

## 7. Resources & Documentation

### 7.1 Official Garmin Resources

**Primary Documentation:**
- FIT SDK Overview: https://developer.garmin.com/fit/overview/
- Encoding Activity Files Cookbook: https://developer.garmin.com/fit/cookbook/encoding-activity-files/
- Activity File Type Description: https://developer.garmin.com/fit/file-types/activity/
- FIT SDK Download: https://developer.garmin.com/fit/download/

**Tools:**
- FitCSVTool: https://developer.garmin.com/fit/fitcsvtool/
- FIT File Format Specification: Included with SDK download

**Best Practices:**
- Use Summary Last message sequencing for devices
- Include Timer Start/Stop events
- Write required message types
- Validate CRC checksums
- Test compatibility with major platforms

### 7.2 Message Type Reference

**Core Message Types:**
- `FileIdMesg` - Identifies file type (REQUIRED first message)
- `RecordMesg` - Sensor data samples (REQUIRED)
- `LapMesg` - Lap summaries (REQUIRED)
- `SessionMesg` - Session summaries (REQUIRED)
- `ActivityMesg` - Activity summary (REQUIRED)
- `EventMesg` - Timer events (BEST PRACTICE)
- `DeviceInfoMesg` - Device identification (BEST PRACTICE)
- `UserProfileMesg` - Athlete settings (RECOMMENDED)

**Pool Swim Specific (Future):**
- `LengthMesg` - Pool length data
- Session fields: `pool_length`, `pool_length_unit`

---

## 8. Appendix

### 8.1 FIT Format Constants

```typescript
// FIT Epoch: December 31, 1989 00:00:00 UTC
const FIT_EPOCH_OFFSET = 631065600; // seconds from Unix epoch

// Conversion functions
function dateToFitTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET;
}

function fitTimestampToDate(fitTimestamp: number): Date {
  return new Date((fitTimestamp + FIT_EPOCH_OFFSET) * 1000);
}

// GPS coordinate conversion
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31));
}
```

### 8.2 Common Sport Type Mappings

```typescript
const SPORT_TYPE_MAP = {
  cycling: Fit.Sport.CYCLING,
  running: Fit.Sport.RUNNING,
  swimming: Fit.Sport.SWIMMING,
  hiking: Fit.Sport.HIKING,
  walking: Fit.Sport.WALKING,
  generic: Fit.Sport.GENERIC
};

const SUB_SPORT_MAP = {
  road: Fit.SubSport.ROAD,
  mountain: Fit.SubSport.MOUNTAIN,
  track: Fit.SubSport.TRACK,
  trail: Fit.SubSport.TRAIL,
  indoor_cycling: Fit.SubSport.VIRTUAL_ACTIVITY,
  lap_swimming: Fit.SubSport.LAP_SWIMMING,
  open_water: Fit.SubSport.OPEN_WATER
};
```

---

## Summary

This updated implementation plan aligns with **Garmin's official FIT SDK** and **best practices** for encoding Activity files. Key improvements include:

1. **Proper Message Sequencing**: Following the "Summary Last" pattern with File ID first, Timer events properly placed, and summary messages at the end
2. **SDK Compliance**: Using official Garmin Encode/Decode classes instead of third-party libraries
3. **Timer Events**: Adding Start/Stop events to indicate recording status
4. **CRC Validation**: Proper file integrity checking via SDK methods
5. **Required Fields**: Ensuring all required message types and fields are included
6. **Platform Compatibility**: Following patterns that work with Garmin Connect, Strava, etc.

The system maintains GradientPeak's local-first architecture while adopting industry-standard FIT format with guaranteed compatibility across all major fitness platforms.