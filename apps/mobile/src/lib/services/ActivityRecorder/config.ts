/**
 * ActivityRecorder Configuration
 * Centralized settings for optimal performance and maintainability
 */

export const RECORDING_CONFIG = {
  // === Data Flow Frequencies ===
  SENSOR_INGESTION_RATE: 'immediate' as const,  // Accept all sensor data immediately
  UI_UPDATE_RATE: 1000,                        // 1Hz UI updates (smooth, not overwhelming)
  DB_BATCH_INTERVAL: 5000,                     // 5s database writes (efficient I/O)
  METRIC_CALC_INTERVAL: 1000,                  // 1Hz metric calculations

  // === Buffer Configurations ===
  BUFFERS: {
    // Power buffer for accurate Normalized Power (30s rolling window)
    POWER_SIZE: 30,
    POWER_SAMPLE_RATE: 1, // 1Hz

    // Heart Rate buffer for smoothing
    HEART_RATE_SIZE: 10,
    HEART_RATE_SAMPLE_RATE: 1,

    // Location buffer for distance calculations
    LOCATION_SIZE: 60,
    LOCATION_SAMPLE_RATE: 1,

    // Cadence buffer
    CADENCE_SIZE: 10,
    CADENCE_SAMPLE_RATE: 1,

    // Normalized Power buffer (store P30^4 values)
    NP_CALCULATION_SIZE: 3600, // 1 hour of 1Hz samples

    // Temperature buffer
    TEMPERATURE_SIZE: 60, // 1 minute
  },

  // === Performance Optimizations ===
  PERFORMANCE: {
    DEBOUNCE_UI_UPDATES: 100,           // 100ms debounce for UI events
    BATCH_SIZE_DB_WRITE: 50,            // Max samples per database write
    THROTTLE_EVENTS: true,              // Enable event throttling
    USE_BACKGROUND_CALC: false,         // Use Web Workers (disabled for now)
    ENABLE_COMPRESSION: true,           // Compress old data
    COMPRESSION_AFTER_MS: 30 * 60 * 1000, // 30 minutes
  },

  // === Metric Precision (reduce unnecessary re-renders) ===
  PRECISION: {
    power: 0,              // Whole watts
    heartRate: 0,          // Whole BPM
    speed: 1,              // 1 decimal place (km/h)
    distance: 0,           // Whole meters
    cadence: 0,            // Whole RPM
    normalizedPower: 0,    // Whole watts
    intensityFactor: 2,    // 2 decimal places (0.85)
    tss: 0,                // Whole points
    elevation: 1,          // 1 decimal place (meters)
    temperature: 1,        // 1 decimal place (°C)
    efficiency: 1,         // 1 decimal place
    grade: 1,              // 1 decimal place (%)
  },

  // === Memory Management ===
  MEMORY: {
    MAX_DURATION_MS: 4 * 60 * 60 * 1000, // 4 hours max in memory
    CLEANUP_INTERVAL_MS: 10 * 60 * 1000,  // Clean up every 10 minutes
    LOW_MEMORY_THRESHOLD: 0.8,            // Trigger cleanup at 80% capacity
  },

  // === Zone Calculations ===
  ZONES: {
    HR_MODEL: '5-zone' as const,
    POWER_MODEL: '7-zone' as const,
    UPDATE_FREQUENCY_MS: 1000, // Update zone times every second
  },

  // === Moving Thresholds ===
  MOVEMENT: {
    SPEED_THRESHOLD_MPS: 0.5,    // 0.5 m/s = ~1.8 km/h
    ELEVATION_NOISE_THRESHOLD_M: 1, // 1 meter elevation change threshold
    DISTANCE_MIN_DELTA_M: 1,     // Minimum distance delta to record
  },
} as const;

// === Tier 1 & Tier 2 Metric Definitions ===
export const METRIC_DEFINITIONS = {
  // Tier 1: Real-time (safe to display every second)
  TIER_1: [
    'elapsedTime',
    'movingTime',
    'distance',
    'avgSpeed',
    'maxSpeed',
    'totalAscent',
    'totalDescent',
    'avgGrade',
    'avgHeartRate',
    'maxHeartRate',
    'avgPower',
    'maxPower',
    'totalWork',
    'avgCadence',
    'maxCadence',
    'calories',
    'hrZone1Time',
    'hrZone2Time',
    'hrZone3Time',
    'hrZone4Time',
    'hrZone5Time',
    'powerZone1Time',
    'powerZone2Time',
    'powerZone3Time',
    'powerZone4Time',
    'powerZone5Time',
    'powerZone6Time',
    'powerZone7Time',
    'maxHrPctThreshold',
    'elevationGainPerKm',
    'powerHeartRateRatio',
    'avgTemperature',
    'maxTemperature',
  ] as const,

  // Tier 2: Live approximations (estimate during activity; finalize after)
  TIER_2: [
    'normalizedPowerEst',
    'intensityFactorEst',
    'trainingStressScoreEst',
    'variabilityIndexEst',
    'efficiencyFactorEst',
    'decouplingEst',
    'adherenceCurrentStep',
  ] as const,
} as const;

// Type definitions
export type Tier1Metric = typeof METRIC_DEFINITIONS.TIER_1[number];
export type Tier2Metric = typeof METRIC_DEFINITIONS.TIER_2[number];
export type AllMetrics = Tier1Metric | Tier2Metric;

// === Event Types ===
export const EVENT_TYPES = {
  // Recording lifecycle
  RECORDING_STARTED: 'recordingStarted',
  RECORDING_PAUSED: 'recordingPaused',
  RECORDING_RESUMED: 'recordingResumed',
  RECORDING_FINISHED: 'recordingFinished',

  // Metrics updates
  METRICS_UPDATE: 'metricsUpdate',
  METRIC_UPDATE: 'metricUpdate',

  // Performance monitoring
  PERFORMANCE_UPDATE: 'performanceUpdate',
  MEMORY_WARNING: 'memoryWarning',

  // Batch processing
  BATCH_WRITE_COMPLETE: 'batchWriteComplete',
  BATCH_WRITE_FAILED: 'batchWriteFailed',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// === Utility Functions ===
export function roundToPrecision(value: number, metric: string): number {
  const precision = RECORDING_CONFIG.PRECISION[metric as keyof typeof RECORDING_CONFIG.PRECISION] || 0;
  return Number(value.toFixed(precision));
}

export function getBufferConfig(metric: string) {
  switch (metric.toLowerCase()) {
    case 'power':
      return RECORDING_CONFIG.BUFFERS.POWER_SIZE;
    case 'heartrate':
    case 'heart_rate':
      return RECORDING_CONFIG.BUFFERS.HEART_RATE_SIZE;
    case 'cadence':
      return RECORDING_CONFIG.BUFFERS.CADENCE_SIZE;
    case 'temperature':
      return RECORDING_CONFIG.BUFFERS.TEMPERATURE_SIZE;
    case 'location':
      return RECORDING_CONFIG.BUFFERS.LOCATION_SIZE;
    default:
      return 10; // Default buffer size
  }
}
