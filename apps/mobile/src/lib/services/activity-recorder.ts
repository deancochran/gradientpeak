/**
 * ActivityRecorderService - Consolidated activity recording with dynamic sensor management
 *
 * Features:
 * - Activity session management (create, start, pause, finish)
 * - Dynamic BLE sensor management (connects to any BLE device)
 * - GPS tracking with background support (optional)
 * - Permission handling (graceful degradation when not granted)
 * - Real-time metric calculations and live dashboard updates
 * - Chunked data storage with compression
 * - Backend sync with retry logic
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  computeActivitySummary,
  parseCSCMeasurement,
  parseCyclingPower,
  parseHeartRate,
  processGPSReading,
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicPlannedActivitiesRow,
  validateSensorReading,
  type ActivityStreamData,
  type ActivitySummary,
  type ProfileSnapshot,
} from "@repo/core";
import { eq } from "drizzle-orm";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { groupBy } from "lodash";
import pako from "pako";
import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";
import { BleManager, Characteristic, Device } from "react-native-ble-plx";
import { localdb as db } from "../db";
import {
  activityRecordings,
  activityRecordingStreams,
} from "../db/schemas/activity_recordings";
import { trpc } from "../trpc";
import type {
  ConnectedSensor,
  GPSReading,
  LiveMetrics,
  PermissionState,
  PermissionType,
  RecordingSession,
  SensorReading,
} from "./activity-recorder.types";

const BACKGROUND_LOCATION_TASK = "background-location-task";

export class ActivityRecorderService {
  private static _sessions: Record<string, RecordingSession> = {};
  private static permissions: Record<PermissionType, PermissionState> =
    {} as Record<PermissionType, PermissionState>;
  private static bleManager: BleManager | null = null;
  private static connectedSensors: Map<string, ConnectedSensor> = new Map();
  private static locationSubscription: Location.LocationSubscription | null =
    null;
  private static lastGPSReading: GPSReading | null = null;
  private static chunkInterval = 5000;
  private static chunkTimers: Record<string, NodeJS.Timeout> = {};
  private static dataCallbacks: Set<(reading: SensorReading) => void> =
    new Set();

  /** Initialize the service with BLE manager and background task */
  static async initialize() {
    this.bleManager = new BleManager();
    this.initializeBleManager();
    await this.cleanupOldTasks();
    this.defineBackgroundLocationTask();
    await this.checkAllPermissions();
    console.log("ActivityRecorderService initialized");
  }

  private static initializeBleManager() {
    if (!this.bleManager) return;

    this.bleManager.onStateChange((state) => {
      if (state === "PoweredOn") {
        console.log("BLE Manager ready");
      } else if (state === "PoweredOff" || state === "Unauthorized") {
        this.disconnectAllSensors();
      }
    }, true);
  }

  private static async cleanupOldTasks() {
    try {
      // Clean up any old background location tasks that might be running
      const oldTaskNames = [
        "ACTIVITY_LOCATION_TRACKING",
        "background-location-task",
      ];

      for (const taskName of oldTaskNames) {
        try {
          const isStarted =
            await Location.hasStartedLocationUpdatesAsync(taskName);
          if (isStarted) {
            await Location.stopLocationUpdatesAsync(taskName);
            console.log(`Cleaned up old background task: ${taskName}`);
          }
        } catch (error) {
          // Ignore errors when cleaning up old tasks
          console.log(`Could not cleanup task ${taskName}:`, error.message);
        }
      }

      // Clean up old AsyncStorage entries
      await AsyncStorage.removeItem("background_location_session_id");
    } catch (error) {
      console.warn("Error during task cleanup:", error);
    }
  }

  private static defineBackgroundLocationTask() {
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
      if (error) {
        console.error("Background location task error:", error);
        return;
      }
      if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        this.handleBackgroundLocations(locations);
      }
    });
  }

  /** Check and request permission for a specific type */
  static async ensurePermission(type: PermissionType): Promise<boolean> {
    let result: { granted: boolean; canAskAgain: boolean };

    switch (type) {
      case "bluetooth":
        result = await this.checkBluetoothPermission();
        if (!result.granted && result.canAskAgain) {
          result = await this.requestBluetoothPermission();
        }
        break;
      case "location":
        const locationStatus = await Location.getForegroundPermissionsAsync();
        result = {
          granted: locationStatus.status === "granted",
          canAskAgain: locationStatus.canAskAgain,
        };
        if (!result.granted && result.canAskAgain) {
          const request = await Location.requestForegroundPermissionsAsync();
          result = {
            granted: request.status === "granted",
            canAskAgain: request.canAskAgain,
          };
        }
        break;
      case "location-background":
        const bgStatus = await Location.getBackgroundPermissionsAsync();
        result = {
          granted: bgStatus.status === "granted",
          canAskAgain: bgStatus.canAskAgain,
        };
        if (!result.granted && result.canAskAgain) {
          const request = await Location.requestBackgroundPermissionsAsync();
          result = {
            granted: request.status === "granted",
            canAskAgain: request.canAskAgain,
          };
        }
        break;
      default:
        return false;
    }

    if (!result.granted && !result.canAskAgain) {
      const names = {
        bluetooth: "Bluetooth",
        location: "Location",
        "location-background": "Background Location",
      };
      Alert.alert(
        `${names[type]} Permission Required`,
        `Please enable ${names[type]} in settings to use this feature.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
    }

    return result.granted;
  }

  private static async checkBluetoothPermission(): Promise<{
    granted: boolean;
    canAskAgain: boolean;
  }> {
    if (Platform.OS !== "android") return { granted: true, canAskAgain: true };

    const apiLevel = Platform.constants?.Version ?? 0;
    try {
      if (apiLevel >= 31) {
        const scan = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        );
        const connect = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
        return { granted: scan && connect, canAskAgain: true };
      } else {
        const location = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        );
        return { granted: location, canAskAgain: true };
      }
    } catch (error) {
      console.error("Error checking Android BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  }

  private static async requestBluetoothPermission(): Promise<{
    granted: boolean;
    canAskAgain: boolean;
  }> {
    if (Platform.OS !== "android") return { granted: true, canAskAgain: true };

    const apiLevel = Platform.constants?.Version ?? 0;
    try {
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        const granted = Object.values(results).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED,
        );
        const denied = Object.values(results).some(
          (result) => result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        );
        return { granted, canAskAgain: !denied };
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {
            title: "Location Permission for Bluetooth",
            message:
              "This app needs location access to scan for Bluetooth fitness devices.",
            buttonPositive: "OK",
          },
        );
        return {
          granted: result === PermissionsAndroid.RESULTS.GRANTED,
          canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        };
      }
    } catch (error) {
      console.error("Error requesting Android BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  }

  private static async checkAllPermissions() {
    const types: PermissionType[] = [
      "bluetooth",
      "location",
      "location-background",
    ];
    const names = {
      bluetooth: "Bluetooth",
      location: "Location",
      "location-background": "Background Location",
    };
    const descriptions = {
      bluetooth: "Connect to heart rate monitors and cycling sensors",
      location: "Track your route and calculate distance",
      "location-background":
        "Continue tracking your route when app is in background",
    };

    for (const type of types) {
      try {
        const result =
          type === "bluetooth"
            ? await this.checkBluetoothPermission()
            : type === "location"
              ? (() =>
                  Location.getForegroundPermissionsAsync().then((s) => ({
                    granted: s.status === "granted",
                    canAskAgain: s.canAskAgain,
                  })))()
              : await Location.getBackgroundPermissionsAsync().then((s) => ({
                  granted: s.status === "granted",
                  canAskAgain: s.canAskAgain,
                }));

        this.permissions[type] = {
          ...result,
          name: names[type],
          description: descriptions[type],
          loading: false,
        };
      } catch (error) {
        console.error(`Error checking permission ${type}:`, error);
      }
    }
  }

  /** Get current permission state */
  static getPermissionState(type: PermissionType): PermissionState | null {
    return this.permissions[type] || null;
  }

  /** Creates a new recording session */
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
      sensorDataBuffer: {},
      chunkIndex: 0,
      totalElapsedTime: 0,
      movingTime: 0,
      lastResumeTime: null,
      lastCheckpointAt: startedAt,
      dataPointsRecorded: 0,
      allValues: new Map(),
      allCoordinates: [],
    };

    this._sessions[id] = session;

    await db.insert(activityRecordings).values({
      id,
      profileId,
      activityType,
      state: "ready",
      startedAt: startedAt.getTime(),
      plannedActivityId: plannedActivity?.id,
      createdAt: Date.now(),
      version: "1.0",
      synced: false,
    });

    return session;
  }

  /** Starts recording by updating session state and starting sensors */
  static async startActivityRecording(id: string) {
    const session = this._sessions[id];
    if (!session) throw new Error(`Session ${id} not found`);

    session.state = "recording";
    session.lastResumeTime = new Date();

    await this.startSensorsForSession(id);
    await db
      .update(activityRecordings)
      .set({ state: "recording" })
      .where(eq(activityRecordings.id, id));
  }

  /** Pauses a recording session */
  static async pauseActivityRecording(id: string) {
    const session = this._sessions[id];
    if (!session) return;

    if (session.lastResumeTime) {
      session.movingTime += Date.now() - session.lastResumeTime.getTime();
    }
    session.state = "paused";
    session.lastResumeTime = null;

    await db
      .update(activityRecordings)
      .set({ state: "paused" })
      .where(eq(activityRecordings.id, id));
  }

  /** Resumes a paused recording session */
  static async resumeActivityRecording(id: string) {
    const session = this._sessions[id];
    if (!session) return;

    session.state = "recording";
    session.lastResumeTime = new Date();

    await db
      .update(activityRecordings)
      .set({ state: "recording" })
      .where(eq(activityRecordings.id, id));
  }

  /** Finishes a recording session with summary calculations */
  static async finishActivityRecording(id: string) {
    const session = this._sessions[id];
    if (!session) return;

    if (session.lastResumeTime) {
      session.movingTime += Date.now() - session.lastResumeTime.getTime();
    }

    session.state = "finished";
    session.totalElapsedTime = Date.now() - session.startedAt.getTime();
    session.finishedAt = new Date();

    await this.stopSensorsForSession(id);
    await this.processChunkForSession(id);

    const summary = await this.computeActivitySummary(session);

    await db
      .update(activityRecordings)
      .set({
        state: "finished",
        finishedAt: session.finishedAt.getTime(),
        movingTime: Math.round(session.movingTime / 1000),
        totalTime: Math.round(session.totalElapsedTime / 1000),
        distance: summary.distance,
        elevation: summary.elevation,
        calories: summary.calories,
        avgHeartRate: summary.averageHeartRate,
        maxHeartRate: summary.maxHeartRate,
        avgPower: summary.averagePower,
        normalizedPower: summary.normalizedPower,
        avgSpeed: summary.averageSpeed,
        maxSpeed: summary.maxSpeed,
        tss: summary.tss,
      })
      .where(eq(activityRecordings.id, id));
  }

  private static async computeActivitySummary(
    session: RecordingSession,
  ): Promise<ActivitySummary> {
    const streamData: ActivityStreamData = {
      timestamps: Array.from(
        { length: Math.max(session.allCoordinates.length, 60) },
        (_, i) =>
          session.startedAt.getTime() +
          (i * session.totalElapsedTime) /
            Math.max(session.allCoordinates.length, 60),
      ),
      heartrate: session.allValues.get("heartrate"),
      power: session.allValues.get("power"),
      speed: session.allValues.get("speed"),
      cadence: session.allValues.get("cadence"),
      altitude: session.allValues.get("altitude"),
      latlng:
        session.allCoordinates.length > 0 ? session.allCoordinates : undefined,
    };

    const profileSnapshot: ProfileSnapshot = {
      weightKg: 70, // Should be fetched from profile
      ftp: 250, // Should be fetched from profile
      thresholdHr: 165, // Should be fetched from profile
    };

    return computeActivitySummary(
      streamData,
      profileSnapshot,
      session.activityType,
    );
  }

  /** Get live metrics for a session */
  static getLiveMetrics(sessionId?: string): LiveMetrics | null {
    if (sessionId) return this._sessions[sessionId]?.currentMetrics || null;

    const activeSession = Object.values(this._sessions).find(
      (s) => s.state === "recording",
    );
    return activeSession?.currentMetrics || null;
  }

  private static async startSensorsForSession(sessionId: string) {
    // Start GPS if permission granted
    if (await this.ensurePermission("location")) {
      await this.startGPSTracking();
    }

    // Start background location if permission granted
    if (await this.ensurePermission("location-background")) {
      await this.startBackgroundLocation(sessionId);
    }

    this.startChunkProcessing(sessionId);
  }

  private static async stopSensorsForSession(sessionId: string) {
    await this.stopGPSTracking();
    await this.stopBackgroundLocation();
    this.stopChunkProcessing(sessionId);
    await this.disconnectAllSensors();
  }

  private static async startGPSTracking() {
    if (this.locationSubscription) return;

    try {
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          const gpsReading: GPSReading = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            altitude: location.coords.altitude || undefined,
            speed: location.coords.speed || undefined,
            heading: location.coords.heading || undefined,
            accuracy: location.coords.accuracy || undefined,
            timestamp: location.timestamp,
          };

          const sensorReadings = processGPSReading(
            gpsReading,
            this.lastGPSReading || undefined,
          );
          sensorReadings.forEach((reading) => this.handleSensorData(reading));
          this.lastGPSReading = gpsReading;
        },
      );
      console.log("GPS tracking started");
    } catch (error) {
      console.error("Failed to start GPS tracking:", error);
    }
  }

  private static async stopGPSTracking() {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
      this.lastGPSReading = null;
      console.log("GPS tracking stopped");
    }
  }

  private static async startBackgroundLocation(sessionId?: string) {
    try {
      const isTaskDefined = await TaskManager.isTaskDefined(
        BACKGROUND_LOCATION_TASK,
      );
      if (!isTaskDefined) return;

      if (sessionId) {
        await AsyncStorage.setItem("background_location_session_id", sessionId);
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: "TurboFit Recording",
          notificationBody: "Recording your activity in the background",
          notificationColor: "#00ff00",
        },
      });
      console.log("Background location tracking started");
    } catch (error) {
      console.error("Failed to start background location:", error);
    }
  }

  private static async stopBackgroundLocation() {
    try {
      const isStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
      );
      if (isStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log("Background location tracking stopped");
      }
      await AsyncStorage.removeItem("background_location_session_id");
    } catch (error) {
      console.error("Failed to stop background location:", error);
    }
  }

  private static async handleBackgroundLocations(
    locations: Location.LocationObject[],
  ) {
    locations.forEach((location) => {
      const gpsReading: GPSReading = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude || undefined,
        speed: location.coords.speed || undefined,
        heading: location.coords.heading || undefined,
        accuracy: location.coords.accuracy || undefined,
        timestamp: location.timestamp,
      };

      const sensorReadings = processGPSReading(
        gpsReading,
        this.lastGPSReading || undefined,
      );
      sensorReadings.forEach((reading) => this.handleSensorData(reading));
      this.lastGPSReading = gpsReading;
    });
  }

  /** Scan for any BLE devices (not limited to fitness devices) */
  static async scanForDevices(): Promise<Device[]> {
    if (!(await this.ensurePermission("bluetooth")) || !this.bleManager) {
      throw new Error("Bluetooth not available");
    }

    const foundDevices: Device[] = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager!.stopDeviceScan();
        resolve(foundDevices);
      }, 10000);

      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.bleManager!.stopDeviceScan();
          reject(error);
          return;
        }

        if (
          device &&
          device.name &&
          !foundDevices.find((d) => d.id === device.id)
        ) {
          foundDevices.push(device);
        }
      });
    });
  }

  /** Connect to any BLE device and discover its characteristics dynamically */
  static async connectToDevice(
    deviceId: string,
  ): Promise<ConnectedSensor | null> {
    if (!this.bleManager) throw new Error("BLE manager not initialized");

    try {
      const device = await this.bleManager.connectToDevice(deviceId, {
        timeout: 5000,
      });
      const deviceWithServices =
        await device.discoverAllServicesAndCharacteristics();

      const services = await deviceWithServices.services();
      const serviceUuids = services.map((s) => s.uuid);

      // Discover all characteristics dynamically
      const characteristics = new Map<string, string>();
      for (const service of services) {
        const chars = await service.characteristics();
        chars.forEach((char) => {
          characteristics.set(char.uuid, service.uuid);
        });
      }

      const connectedSensor: ConnectedSensor = {
        id: device.id,
        name: device.name || "Unknown Device",
        services: serviceUuids,
        device: deviceWithServices,
        connectionTime: new Date(),
        characteristics,
      };

      this.connectedSensors.set(device.id, connectedSensor);
      await this.startMonitoringDevice(connectedSensor);

      device.onDisconnected(() => {
        console.log(`Device disconnected: ${device.name}`);
        this.connectedSensors.delete(device.id);
      });

      return connectedSensor;
    } catch (error) {
      console.error("Failed to connect to device:", error);
      return null;
    }
  }

  /** Disconnect from a specific device */
  static async disconnectDevice(deviceId: string) {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor?.device) {
      try {
        await sensor.device.cancelConnection();
        this.connectedSensors.delete(deviceId);
      } catch (error) {
        console.error("Error disconnecting device:", error);
      }
    }
  }

  /** Disconnect from all devices */
  static async disconnectAllSensors() {
    const disconnectPromises = Array.from(this.connectedSensors.keys()).map(
      (id) => this.disconnectDevice(id),
    );
    await Promise.allSettled(disconnectPromises);
  }

  /** Start monitoring a connected device based on its characteristics */
  private static async startMonitoringDevice(sensor: ConnectedSensor) {
    if (!sensor.device) return;

    // Well-known GATT UUIDs for fitness devices
    const knownCharacteristics = {
      "00002a37-0000-1000-8000-00805f9b34fb": "heart_rate", // Heart Rate Measurement
      "00002a63-0000-1000-8000-00805f9b34fb": "cycling_power", // Cycling Power Measurement
      "00002a5b-0000-1000-8000-00805f9b34fb": "csc_measurement", // CSC Measurement
    };

    try {
      for (const [charUuid, serviceUuid] of sensor.characteristics) {
        const charType = knownCharacteristics[charUuid.toLowerCase()];
        if (charType) {
          const characteristic = await this.getCharacteristic(
            sensor.device,
            serviceUuid,
            charUuid,
          );
          if (characteristic) {
            this.monitorCharacteristic(
              characteristic,
              charType,
              sensor.device.id,
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error monitoring device ${sensor.name}:`, error);
    }
  }

  /** Monitor a specific characteristic based on its type */
  private static monitorCharacteristic(
    characteristic: Characteristic,
    type: string,
    deviceId: string,
  ) {
    characteristic.monitor((error, char) => {
      if (error || !char?.value) return;

      const data = Buffer.from(char.value, "base64").buffer;
      let readings: SensorReading[] = [];

      switch (type) {
        case "heart_rate":
          const hrReading = parseHeartRate(data);
          if (hrReading) readings = [hrReading];
          break;
        case "cycling_power":
          readings = parseCyclingPower(data);
          break;
        case "csc_measurement":
          readings = parseCSCMeasurement(data);
          break;
      }

      readings.forEach((reading) => {
        reading.deviceId = deviceId;
        this.handleSensorData(reading);
      });
    });
  }

  /** Get characteristic from device */
  private static async getCharacteristic(
    device: Device,
    serviceUUID: string,
    characteristicUUID: string,
  ): Promise<Characteristic | null> {
    try {
      const services = await device.services();
      const service = services.find(
        (s) => s.uuid.toLowerCase() === serviceUUID.toLowerCase(),
      );
      if (!service) return null;

      const characteristics = await service.characteristics();
      return (
        characteristics.find(
          (c) => c.uuid.toLowerCase() === characteristicUUID.toLowerCase(),
        ) || null
      );
    } catch (error) {
      console.error("Error getting characteristic:", error);
      return null;
    }
  }

  /** Get connected sensors */
  static getConnectedSensors(): ConnectedSensor[] {
    return Array.from(this.connectedSensors.values());
  }

  /** Handle incoming sensor data */
  private static handleSensorData(reading: SensorReading) {
    if (!validateSensorReading(reading)) return;

    const activeSessions = Object.values(this._sessions).filter(
      (s) => s.state === "recording",
    );
    activeSessions.forEach((session) =>
      this.updateSessionWithSensorData(session, reading),
    );

    this.dataCallbacks.forEach((callback) => {
      try {
        callback(reading);
      } catch (error) {
        console.warn("Error in sensor data callback:", error);
      }
    });
  }

  /** Update session with new sensor reading */
  private static updateSessionWithSensorData(
    session: RecordingSession,
    reading: SensorReading,
  ) {
    const { metric, value, timestamp } = reading;

    // Initialize buffer and values array for this metric if not exists
    if (!session.sensorDataBuffer[metric]) {
      session.sensorDataBuffer[metric] = [];
    }
    if (!session.allValues.has(metric)) {
      session.allValues.set(metric, []);
    }

    switch (metric) {
      case "latlng":
        if (Array.isArray(value) && value.length === 2) {
          const coords: [number, number] = [value[0], value[1]];
          session.sensorDataBuffer[metric].push({ value: coords, timestamp });
          session.allCoordinates.push(coords);
          session.currentMetrics.currentLatitude = value[0];
          session.currentMetrics.currentLongitude = value[1];
          this.updateDistanceFromGPS(session);
        }
        break;
      default:
        if (typeof value === "number") {
          session.sensorDataBuffer[metric].push({ value, timestamp });
          session.allValues.get(metric)!.push(value);

          // Update current metrics
          switch (metric) {
            case "heartrate":
              session.currentMetrics.heartRate = value;
              this.updateAggregateMetrics(session, "heartrate", "HeartRate");
              break;
            case "power":
              session.currentMetrics.power = value;
              this.updateAggregateMetrics(session, "power", "Power");
              break;
            case "speed":
              session.currentMetrics.speed = value;
              this.updateAggregateMetrics(session, "speed", "Speed");
              break;
            case "cadence":
              session.currentMetrics.cadence = value;
              this.updateAggregateMetrics(session, "cadence", "Cadence");
              break;
            case "altitude":
              session.currentMetrics.currentAltitude = value;
              this.updateElevationMetrics(session);
              break;
            case "distance":
              session.currentMetrics.distance =
                (session.currentMetrics.distance || 0) + value;
              break;
          }
        }
        break;
    }

    session.dataPointsRecorded++;
  }

  /** Update aggregate metrics (avg, max) for a given metric */
  private static updateAggregateMetrics(
    session: RecordingSession,
    metric: string,
    suffix: string,
  ) {
    const values = session.allValues.get(metric)?.filter((v) => v > 0) || [];
    if (values.length > 0) {
      (session.currentMetrics as any)[`avg${suffix}`] =
        values.reduce((a, b) => a + b, 0) / values.length;
      (session.currentMetrics as any)[`max${suffix}`] = Math.max(...values);
    }
  }

  /** Update distance from GPS coordinates */
  private static updateDistanceFromGPS(session: RecordingSession) {
    const coords = session.allCoordinates;
    if (coords.length >= 2) {
      const [lat1, lon1] = coords[coords.length - 2];
      const [lat2, lon2] = coords[coords.length - 1];

      const R = 6371000; // Earth's radius in meters
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const segmentDistance = R * c;

      session.currentMetrics.distance =
        (session.currentMetrics.distance || 0) + segmentDistance;
    }
  }

  /** Update elevation metrics */
  private static updateElevationMetrics(session: RecordingSession) {
    const altitudes = session.allValues.get("altitude") || [];
    if (altitudes.length >= 2) {
      let totalGain = 0;
      for (let i = 1; i < altitudes.length; i++) {
        const change = altitudes[i] - altitudes[i - 1];
        if (change > 0) totalGain += change;
      }
      session.currentMetrics.elevation = totalGain;
    }
  }

  /** Add external data callback */
  static addDataCallback(callback: (reading: SensorReading) => void) {
    this.dataCallbacks.add(callback);
  }

  /** Remove external data callback */
  static removeDataCallback(callback: (reading: SensorReading) => void) {
    this.dataCallbacks.delete(callback);
  }

  private static startChunkProcessing(sessionId: string) {
    if (this.chunkTimers[sessionId]) clearInterval(this.chunkTimers[sessionId]);
    this.chunkTimers[sessionId] = setInterval(
      () => this.processChunkForSession(sessionId),
      this.chunkInterval,
    );
  }

  private static stopChunkProcessing(sessionId: string) {
    if (this.chunkTimers[sessionId]) {
      clearInterval(this.chunkTimers[sessionId]);
      delete this.chunkTimers[sessionId];
    }
  }

  /** Process buffered data into chunks for storage */
  private static async processChunkForSession(sessionId: string) {
    const session = this._sessions[sessionId];
    if (!session || session.state !== "recording") return;

    const now = Date.now();
    const chunkStartTime = session.lastCheckpointAt.getTime();

    for (const [metric, buffer] of Object.entries(session.sensorDataBuffer)) {
      if (buffer.length === 0) continue;

      const data = buffer.map((item) => item.value);
      const timestamps = buffer.map((item) => item.timestamp);

      await this.createActivityRecordingStream({
        activityRecordingId: session.id,
        metric: metric as PublicActivityMetric,
        dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
        chunkIndex: session.chunkIndex,
        startTime: chunkStartTime,
        endTime: now,
        data,
        timestamps,
        sampleCount: buffer.length,
      });

      buffer.length = 0;
    }

    session.lastCheckpointAt = new Date(now);
    session.chunkIndex++;
  }

  /** Create a new chunk of metric data */
  private static async createActivityRecordingStream(chunk: {
    activityRecordingId: string;
    metric: PublicActivityMetric;
    dataType: PublicActivityMetricDataType;
    chunkIndex: number;
    startTime: number;
    endTime: number;
    data: (number | [number, number])[];
    timestamps: number[];
    sampleCount: number;
  }) {
    return db.insert(activityRecordingStreams).values(chunk);
  }

  /** Get data type for a metric */
  private static getDataTypeForMetric(
    metric: PublicActivityMetric,
  ): PublicActivityMetricDataType {
    const dataTypes: Record<
      PublicActivityMetric,
      PublicActivityMetricDataType
    > = {
      heartrate: "integer",
      power: "integer",
      speed: "float",
      cadence: "integer",
      distance: "float",
      latlng: "latlng",
      altitude: "float",
      temperature: "float",
      gradient: "float",
      moving: "boolean",
    };
    return dataTypes[metric] || "float";
  }

  /** List all metric chunks for a given activity */
  static async listActivityRecordingStreams(activityId: string) {
    return db
      .select()
      .from(activityRecordingStreams)
      .where(eq(activityRecordingStreams.activityRecordingId, activityId));
  }

  /** Compresses all metric chunks and uploads to backend */
  static async uploadCompletedActivity(activityId: string) {
    try {
      const chunks = await this.listActivityRecordingStreams(activityId);
      const activityRecord = await db
        .select()
        .from(activityRecordings)
        .where(eq(activityRecordings.id, activityId))
        .limit(1);

      if (activityRecord.length === 0)
        throw new Error(`Activity ${activityId} not found`);

      const activity = activityRecord[0];
      const client = trpc.createClient();

      const uploadedActivity = await client.activities.create.mutate({
        activityType: activity.activityType,
        startedAt: new Date(activity.startedAt).toISOString(),
        movingTime: activity.movingTime || 0,
        totalTime: activity.totalTime || 0,
        distance: activity.distance || 0,
        elevation: activity.elevation || 0,
        calories: activity.calories || 0,
        avgHeartRate: activity.avgHeartRate,
        maxHeartRate: activity.maxHeartRate,
        avgPower: activity.avgPower,
        normalizedPower: activity.normalizedPower,
        avgSpeed: activity.avgSpeed || 0,
        maxSpeed: activity.maxSpeed || 0,
        tss: activity.tss,
        name: `${activity.activityType} - ${new Date(activity.startedAt).toLocaleDateString()}`,
        profileId: activity.profileId,
      });

      if (chunks.length === 0) return;

      const grouped = groupBy(chunks, (c) => c.metric);
      const streamUploads = [];

      for (const [metric, metricChunks] of Object.entries(grouped)) {
        const combinedData: (number | [number, number])[] = [];
        const combinedTimestamps: number[] = [];

        metricChunks.forEach((chunk) => {
          if (Array.isArray(chunk.data))
            combinedData.push(...(chunk.data as (number | [number, number])[]));
          if (Array.isArray(chunk.timestamps))
            combinedTimestamps.push(...(chunk.timestamps as number[]));
        });

        if (combinedData.length === 0) continue;

        const dataToCompress = JSON.stringify({
          data: combinedData,
          timestamps: combinedTimestamps,
        });
        const compressed = pako.gzip(dataToCompress);
        const compressedBase64 = Buffer.from(compressed).toString("base64");

        streamUploads.push({
          metric: metric as PublicActivityMetric,
          dataType: this.getDataTypeForMetric(metric as PublicActivityMetric),
          originalSize: combinedData.length,
          compressedData: compressedBase64,
          sampleCount: combinedData.length,
        });
      }

      if (streamUploads.length > 0) {
        await client.activityStreams.batchCreate.mutate({
          activityId: uploadedActivity.id,
          streams: streamUploads,
        });
      }

      await db
        .update(activityRecordingStreams)
        .set({ synced: true })
        .where(eq(activityRecordingStreams.activityRecordingId, activityId));
      await db
        .update(activityRecordings)
        .set({ synced: true })
        .where(eq(activityRecordings.id, activityId));

      console.log(
        `Successfully uploaded activity ${activityId} with ${chunks.length} chunks`,
      );
    } catch (error) {
      console.error("Failed to upload activity:", error);
      throw error;
    }
  }

  /** Cleanup resources when service is no longer needed */
  static async cleanup() {
    await this.stopGPSTracking();
    await this.stopBackgroundLocation();
    await this.disconnectAllSensors();

    Object.values(this.chunkTimers).forEach((timer) => clearInterval(timer));
    this.chunkTimers = {};
    this.dataCallbacks.clear();

    console.log("ActivityRecorderService cleaned up");
  }

  // Export static properties for external access
  static get sessions() {
    return this._sessions;
  }
}
