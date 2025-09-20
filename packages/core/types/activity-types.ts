/**
 * Activity type definitions with recording constraints and capabilities
 */

// ================================
// Activity Type Definitions
// ================================

/**
 * Supported activity types with unique identifiers
 */
export enum ActivityTypeId {
  // Cycling
  ROAD_CYCLING = "road_cycling",
  MOUNTAIN_BIKING = "mountain_biking",
  INDOOR_CYCLING = "indoor_cycling",
  GRAVEL_CYCLING = "gravel_cycling",
  TRACK_CYCLING = "track_cycling",

  // Running
  OUTDOOR_RUN = "outdoor_run",
  TREADMILL_RUN = "treadmill_run",
  TRAIL_RUN = "trail_run",
  TRACK_RUN = "track_run",

  // Swimming
  OPEN_WATER_SWIM = "open_water_swim",
  POOL_SWIM = "pool_swim",

  // Walking/Hiking
  OUTDOOR_WALK = "outdoor_walk",
  TREADMILL_WALK = "treadmill_walk",
  HIKING = "hiking",
  MOUNTAINEERING = "mountaineering",

  // Other Sports
  ROWING = "rowing",
  KAYAKING = "kayaking",
  SKIING = "skiing",
  SNOWBOARDING = "snowboarding",
  CLIMBING = "climbing",
  YOGA = "yoga",
  STRENGTH_TRAINING = "strength_training",
  ELLIPTICAL = "elliptical",

  // Generic
  OTHER = "other",
}

/**
 * Environment types for activities
 */
export enum ActivityEnvironment {
  OUTDOOR = "outdoor",
  INDOOR = "indoor",
  WATER = "water",
  MIXED = "mixed",
}

/**
 * Available metrics that can be recorded during activities
 */
export enum RecordableMetric {
  GPS_LOCATION = "gps_location",
  GPS_SPEED = "gps_speed",
  GPS_PACE = "gps_pace",
  GPS_DISTANCE = "gps_distance",
  GPS_ELEVATION = "gps_elevation",

  HEART_RATE = "heart_rate",
  POWER = "power",
  CADENCE = "cadence",

  SPEED_SENSOR = "speed_sensor",
  DISTANCE_SENSOR = "distance_sensor",

  STROKE_RATE = "stroke_rate", // Swimming/Rowing
  STROKES_PER_LENGTH = "strokes_per_length", // Swimming
  SWOLF = "swolf", // Swimming efficiency

  REP_COUNT = "rep_count", // Strength training
  WEIGHT = "weight", // Strength training

  TEMPERATURE = "temperature",
  TIME = "time",
  MANUAL_DISTANCE = "manual_distance",
}

/**
 * Data sources for metrics
 */
export enum MetricDataSource {
  GPS = "gps",
  BLUETOOTH_HR = "bluetooth_hr",
  BLUETOOTH_POWER = "bluetooth_power",
  BLUETOOTH_CADENCE = "bluetooth_cadence",
  BLUETOOTH_SPEED = "bluetooth_speed",
  BLUETOOTH_DISTANCE = "bluetooth_distance",
  MANUAL_ENTRY = "manual_entry",
  CALCULATED = "calculated",
  DEVICE_SENSORS = "device_sensors",
  ESTIMATED = "estimated",
}

/**
 * Recording constraints for activity types
 */
export interface ActivityRecordingConstraints {
  /** Required metrics that must be available */
  requiredMetrics: RecordableMetric[];

  /** Available metrics that can be recorded */
  availableMetrics: RecordableMetric[];

  /** Metrics that are not applicable/should not be recorded */
  excludedMetrics: RecordableMetric[];

  /** Whether GPS is required for this activity */
  requiresGPS: boolean;

  /** Whether GPS is useful/recommended for this activity */
  recommendsGPS: boolean;

  /** Whether heart rate monitoring is recommended */
  recommendsHeartRate: boolean;

  /** Whether power measurement is applicable */
  supportsPower: boolean;

  /** Whether cadence measurement is applicable */
  supportsCadence: boolean;

  /** Default recording interval in seconds */
  defaultRecordingInterval: number;

  /** Minimum activity duration in seconds to be considered valid */
  minimumDuration: number;

  /** Whether auto-pause is recommended for this activity */
  recommendsAutoPause: boolean;
}

/**
 * Display configuration for activity types
 */
export interface ActivityDisplayConfig {
  /** Primary color for UI elements */
  primaryColor: string;

  /** Icon name for the activity */
  iconName: string;

  /** Emoji representation */
  emoji: string;

  /** Primary unit for distance display */
  primaryDistanceUnit: "meters" | "kilometers" | "miles" | "yards";

  /** Primary unit for pace display */
  primaryPaceUnit:
    | "min_per_km"
    | "min_per_mile"
    | "min_per_100m"
    | "min_per_100y"
    | null;

  /** Whether to show pace instead of speed */
  showPaceInsteadOfSpeed: boolean;
}

/**
 * Complete activity type definition
 */
export interface ActivityType {
  /** Unique identifier */
  id: ActivityTypeId;

  /** Display name for UI */
  name: string;

  /** Short name for compact displays */
  shortName: string;

  /** Detailed description */
  description: string;

  /** Activity environment */
  environment: ActivityEnvironment;

  /** Recording constraints and capabilities */
  recordingConstraints: ActivityRecordingConstraints;

  /** Display configuration */
  displayConfig: ActivityDisplayConfig;

  /** Sport category for grouping */
  category:
    | "cycling"
    | "running"
    | "swimming"
    | "walking"
    | "strength"
    | "other";

  /** Whether this activity type is commonly used */
  isPopular: boolean;
}

// ================================
// Predefined Activity Types
// ================================

/**
 * Base constraints for outdoor endurance activities
 */
const OUTDOOR_ENDURANCE_CONSTRAINTS: ActivityRecordingConstraints = {
  requiredMetrics: [RecordableMetric.TIME],
  availableMetrics: [
    RecordableMetric.TIME,
    RecordableMetric.GPS_LOCATION,
    RecordableMetric.GPS_SPEED,
    RecordableMetric.GPS_PACE,
    RecordableMetric.GPS_DISTANCE,
    RecordableMetric.GPS_ELEVATION,
    RecordableMetric.HEART_RATE,
    RecordableMetric.TEMPERATURE,
  ],
  excludedMetrics: [],
  requiresGPS: true,
  recommendsGPS: true,
  recommendsHeartRate: true,
  supportsPower: false,
  supportsCadence: false,
  defaultRecordingInterval: 1,
  minimumDuration: 60,
  recommendsAutoPause: true,
};

/**
 * Base constraints for indoor activities
 */
const INDOOR_ENDURANCE_CONSTRAINTS: ActivityRecordingConstraints = {
  requiredMetrics: [RecordableMetric.TIME],
  availableMetrics: [
    RecordableMetric.TIME,
    RecordableMetric.HEART_RATE,
    RecordableMetric.MANUAL_DISTANCE,
    RecordableMetric.TEMPERATURE,
  ],
  excludedMetrics: [
    RecordableMetric.GPS_LOCATION,
    RecordableMetric.GPS_SPEED,
    RecordableMetric.GPS_PACE,
    RecordableMetric.GPS_DISTANCE,
    RecordableMetric.GPS_ELEVATION,
  ],
  requiresGPS: false,
  recommendsGPS: false,
  recommendsHeartRate: true,
  supportsPower: false,
  supportsCadence: false,
  defaultRecordingInterval: 1,
  minimumDuration: 60,
  recommendsAutoPause: false,
};

/**
 * Comprehensive activity type definitions
 */
export const ACTIVITY_TYPES: Record<ActivityTypeId, ActivityType> = {
  [ActivityTypeId.ROAD_CYCLING]: {
    id: ActivityTypeId.ROAD_CYCLING,
    name: "Road Cycling",
    shortName: "Road Bike",
    description: "Road cycling on paved surfaces",
    environment: ActivityEnvironment.OUTDOOR,
    category: "cycling",
    isPopular: true,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
        RecordableMetric.SPEED_SENSOR,
        RecordableMetric.DISTANCE_SENSOR,
      ],
      supportsPower: true,
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#3b82f6",
      iconName: "bicycle",
      emoji: "🚴‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.MOUNTAIN_BIKING]: {
    id: ActivityTypeId.MOUNTAIN_BIKING,
    name: "Mountain Biking",
    shortName: "MTB",
    description: "Off-road cycling on trails and mountains",
    environment: ActivityEnvironment.OUTDOOR,
    category: "cycling",
    isPopular: true,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
      ],
      supportsPower: true,
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#16a34a",
      iconName: "bicycle",
      emoji: "🚵‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.INDOOR_CYCLING]: {
    id: ActivityTypeId.INDOOR_CYCLING,
    name: "Indoor Cycling",
    shortName: "Indoor Bike",
    description: "Indoor cycling or trainer sessions",
    environment: ActivityEnvironment.INDOOR,
    category: "cycling",
    isPopular: true,
    recordingConstraints: {
      ...INDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...INDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
        RecordableMetric.SPEED_SENSOR,
        RecordableMetric.DISTANCE_SENSOR,
      ],
      supportsPower: true,
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#7c3aed",
      iconName: "bicycle",
      emoji: "🚴‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.OUTDOOR_RUN]: {
    id: ActivityTypeId.OUTDOOR_RUN,
    name: "Outdoor Run",
    shortName: "Run",
    description: "Running outdoors on roads or paths",
    environment: ActivityEnvironment.OUTDOOR,
    category: "running",
    isPopular: true,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.CADENCE,
      ],
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#dc2626",
      iconName: "walk",
      emoji: "🏃‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.TREADMILL_RUN]: {
    id: ActivityTypeId.TREADMILL_RUN,
    name: "Treadmill Run",
    shortName: "Treadmill",
    description: "Running on a treadmill indoors",
    environment: ActivityEnvironment.INDOOR,
    category: "running",
    isPopular: true,
    recordingConstraints: {
      ...INDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...INDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.CADENCE,
      ],
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#ea580c",
      iconName: "walk",
      emoji: "🏃‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.TRAIL_RUN]: {
    id: ActivityTypeId.TRAIL_RUN,
    name: "Trail Run",
    shortName: "Trail",
    description: "Trail running on natural surfaces",
    environment: ActivityEnvironment.OUTDOOR,
    category: "running",
    isPopular: true,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.CADENCE,
      ],
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#16a34a",
      iconName: "walk",
      emoji: "🥾",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.OPEN_WATER_SWIM]: {
    id: ActivityTypeId.OPEN_WATER_SWIM,
    name: "Open Water Swimming",
    shortName: "Open Water",
    description: "Swimming in lakes, rivers, or ocean",
    environment: ActivityEnvironment.WATER,
    category: "swimming",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.HEART_RATE,
        RecordableMetric.STROKE_RATE,
        RecordableMetric.TEMPERATURE,
      ],
      excludedMetrics: [
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_PACE,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
      ],
      requiresGPS: true,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 1,
      minimumDuration: 300, // 5 minutes
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#0ea5e9",
      iconName: "water",
      emoji: "🏊‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: "min_per_100m",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.POOL_SWIM]: {
    id: ActivityTypeId.POOL_SWIM,
    name: "Pool Swimming",
    shortName: "Pool",
    description: "Swimming in a pool with lanes",
    environment: ActivityEnvironment.INDOOR,
    category: "swimming",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.MANUAL_DISTANCE,
        RecordableMetric.HEART_RATE,
        RecordableMetric.STROKE_RATE,
        RecordableMetric.STROKES_PER_LENGTH,
        RecordableMetric.SWOLF,
      ],
      excludedMetrics: [
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_PACE,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.GPS_ELEVATION,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
      ],
      requiresGPS: false,
      recommendsGPS: false,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 1,
      minimumDuration: 300, // 5 minutes
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#06b6d4",
      iconName: "water",
      emoji: "🏊‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: "min_per_100m",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.OUTDOOR_WALK]: {
    id: ActivityTypeId.OUTDOOR_WALK,
    name: "Outdoor Walk",
    shortName: "Walk",
    description: "Walking outdoors for exercise or leisure",
    environment: ActivityEnvironment.OUTDOOR,
    category: "walking",
    isPopular: true,
    recordingConstraints: OUTDOOR_ENDURANCE_CONSTRAINTS,
    displayConfig: {
      primaryColor: "#65a30d",
      iconName: "walk",
      emoji: "🚶‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.TREADMILL_WALK]: {
    id: ActivityTypeId.TREADMILL_WALK,
    name: "Treadmill Walk",
    shortName: "Treadmill Walk",
    description: "Walking on a treadmill indoors",
    environment: ActivityEnvironment.INDOOR,
    category: "walking",
    isPopular: true,
    recordingConstraints: INDOOR_ENDURANCE_CONSTRAINTS,
    displayConfig: {
      primaryColor: "#84cc16",
      iconName: "walk",
      emoji: "🚶‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.HIKING]: {
    id: ActivityTypeId.HIKING,
    name: "Hiking",
    shortName: "Hike",
    description: "Hiking on trails with elevation changes",
    environment: ActivityEnvironment.OUTDOOR,
    category: "walking",
    isPopular: true,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      minimumDuration: 600, // 10 minutes
    },
    displayConfig: {
      primaryColor: "#16a34a",
      iconName: "walk",
      emoji: "🥾",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.STRENGTH_TRAINING]: {
    id: ActivityTypeId.STRENGTH_TRAINING,
    name: "Strength Training",
    shortName: "Strength",
    description: "Weight training or bodyweight exercises",
    environment: ActivityEnvironment.INDOOR,
    category: "strength",
    isPopular: true,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.HEART_RATE,
        RecordableMetric.REP_COUNT,
        RecordableMetric.WEIGHT,
      ],
      excludedMetrics: [
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_PACE,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.GPS_ELEVATION,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
        RecordableMetric.MANUAL_DISTANCE,
      ],
      requiresGPS: false,
      recommendsGPS: false,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 5, // Less frequent recording
      minimumDuration: 300, // 5 minutes
      recommendsAutoPause: true,
    },
    displayConfig: {
      primaryColor: "#db2777",
      iconName: "barbell",
      emoji: "🏋️‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.YOGA]: {
    id: ActivityTypeId.YOGA,
    name: "Yoga",
    shortName: "Yoga",
    description: "Yoga practice and stretching",
    environment: ActivityEnvironment.INDOOR,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [RecordableMetric.TIME, RecordableMetric.HEART_RATE],
      excludedMetrics: [
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_PACE,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.GPS_ELEVATION,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
        RecordableMetric.MANUAL_DISTANCE,
      ],
      requiresGPS: false,
      recommendsGPS: false,
      recommendsHeartRate: false,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 10,
      minimumDuration: 300, // 5 minutes
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#a855f7",
      iconName: "leaf",
      emoji: "🧘‍♀️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.GRAVEL_CYCLING]: {
    id: ActivityTypeId.GRAVEL_CYCLING,
    name: "Gravel Cycling",
    shortName: "Gravel",
    description: "Mixed terrain cycling on gravel roads",
    environment: ActivityEnvironment.OUTDOOR,
    category: "cycling",
    isPopular: false,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
      ],
      supportsPower: true,
      supportsCadence: true,
    },
    displayConfig: {
      primaryColor: "#a3a3a3",
      iconName: "bicycle",
      emoji: "🚴‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.TRACK_CYCLING]: {
    id: ActivityTypeId.TRACK_CYCLING,
    name: "Track Cycling",
    shortName: "Track",
    description: "Cycling on a velodrome or track",
    environment: ActivityEnvironment.OUTDOOR,
    category: "cycling",
    isPopular: false,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
        RecordableMetric.SPEED_SENSOR,
      ],
      supportsPower: true,
      supportsCadence: true,
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#ff6b35",
      iconName: "bicycle",
      emoji: "🚴‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.TRACK_RUN]: {
    id: ActivityTypeId.TRACK_RUN,
    name: "Track Running",
    shortName: "Track",
    description: "Running on an athletic track",
    environment: ActivityEnvironment.OUTDOOR,
    category: "running",
    isPopular: false,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      availableMetrics: [
        ...OUTDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.CADENCE,
      ],
      supportsCadence: true,
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#ff4757",
      iconName: "walk",
      emoji: "🏃‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.MOUNTAINEERING]: {
    id: ActivityTypeId.MOUNTAINEERING,
    name: "Mountaineering",
    shortName: "Mountaineering",
    description: "Technical climbing and mountaineering",
    environment: ActivityEnvironment.OUTDOOR,
    category: "walking",
    isPopular: false,
    recordingConstraints: {
      ...OUTDOOR_ENDURANCE_CONSTRAINTS,
      minimumDuration: 1800, // 30 minutes
    },
    displayConfig: {
      primaryColor: "#2c3e50",
      iconName: "walk",
      emoji: "🏔️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.ROWING]: {
    id: ActivityTypeId.ROWING,
    name: "Rowing",
    shortName: "Rowing",
    description: "Rowing on water or rowing machine",
    environment: ActivityEnvironment.MIXED,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.HEART_RATE,
        RecordableMetric.POWER,
        RecordableMetric.STROKE_RATE,
        RecordableMetric.MANUAL_DISTANCE,
      ],
      excludedMetrics: [RecordableMetric.CADENCE],
      requiresGPS: false,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: true,
      supportsCadence: false,
      defaultRecordingInterval: 1,
      minimumDuration: 300,
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#0ea5e9",
      iconName: "boat",
      emoji: "🚣‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.KAYAKING]: {
    id: ActivityTypeId.KAYAKING,
    name: "Kayaking",
    shortName: "Kayak",
    description: "Kayaking on rivers, lakes, or ocean",
    environment: ActivityEnvironment.WATER,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.HEART_RATE,
        RecordableMetric.STROKE_RATE,
      ],
      excludedMetrics: [RecordableMetric.POWER, RecordableMetric.CADENCE],
      requiresGPS: true,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 1,
      minimumDuration: 600,
      recommendsAutoPause: false,
    },
    displayConfig: {
      primaryColor: "#06b6d4",
      iconName: "boat",
      emoji: "🛶",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: "min_per_km",
      showPaceInsteadOfSpeed: true,
    },
  },

  [ActivityTypeId.SKIING]: {
    id: ActivityTypeId.SKIING,
    name: "Skiing",
    shortName: "Skiing",
    description: "Downhill or cross-country skiing",
    environment: ActivityEnvironment.OUTDOOR,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.GPS_ELEVATION,
        RecordableMetric.HEART_RATE,
        RecordableMetric.TEMPERATURE,
      ],
      excludedMetrics: [RecordableMetric.POWER, RecordableMetric.CADENCE],
      requiresGPS: true,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 1,
      minimumDuration: 300,
      recommendsAutoPause: true,
    },
    displayConfig: {
      primaryColor: "#e7e5e4",
      iconName: "snow",
      emoji: "⛷️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.SNOWBOARDING]: {
    id: ActivityTypeId.SNOWBOARDING,
    name: "Snowboarding",
    shortName: "Snowboard",
    description: "Snowboarding on slopes",
    environment: ActivityEnvironment.OUTDOOR,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.GPS_ELEVATION,
        RecordableMetric.HEART_RATE,
        RecordableMetric.TEMPERATURE,
      ],
      excludedMetrics: [RecordableMetric.POWER, RecordableMetric.CADENCE],
      requiresGPS: true,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 1,
      minimumDuration: 300,
      recommendsAutoPause: true,
    },
    displayConfig: {
      primaryColor: "#f472b6",
      iconName: "snow",
      emoji: "🏂",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.CLIMBING]: {
    id: ActivityTypeId.CLIMBING,
    name: "Rock Climbing",
    shortName: "Climbing",
    description: "Rock climbing or bouldering",
    environment: ActivityEnvironment.OUTDOOR,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.HEART_RATE,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_ELEVATION,
      ],
      excludedMetrics: [
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_PACE,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
      ],
      requiresGPS: false,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: false,
      supportsCadence: false,
      defaultRecordingInterval: 5,
      minimumDuration: 600,
      recommendsAutoPause: true,
    },
    displayConfig: {
      primaryColor: "#dc2626",
      iconName: "trending-up",
      emoji: "🧗‍♂️",
      primaryDistanceUnit: "meters",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.ELLIPTICAL]: {
    id: ActivityTypeId.ELLIPTICAL,
    name: "Elliptical",
    shortName: "Elliptical",
    description: "Elliptical machine activity",
    environment: ActivityEnvironment.INDOOR,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      ...INDOOR_ENDURANCE_CONSTRAINTS,
      supportsCadence: true,
      availableMetrics: [
        ...INDOOR_ENDURANCE_CONSTRAINTS.availableMetrics,
        RecordableMetric.CADENCE,
      ],
    },
    displayConfig: {
      primaryColor: "#8b5cf6",
      iconName: "fitness",
      emoji: "🏃‍♂️",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },

  [ActivityTypeId.OTHER]: {
    id: ActivityTypeId.OTHER,
    name: "Other Activity",
    shortName: "Other",
    description: "Generic activity type for unlisted activities",
    environment: ActivityEnvironment.MIXED,
    category: "other",
    isPopular: false,
    recordingConstraints: {
      requiredMetrics: [RecordableMetric.TIME],
      availableMetrics: [
        RecordableMetric.TIME,
        RecordableMetric.GPS_LOCATION,
        RecordableMetric.GPS_SPEED,
        RecordableMetric.GPS_DISTANCE,
        RecordableMetric.GPS_ELEVATION,
        RecordableMetric.HEART_RATE,
        RecordableMetric.POWER,
        RecordableMetric.CADENCE,
        RecordableMetric.MANUAL_DISTANCE,
        RecordableMetric.TEMPERATURE,
      ],
      excludedMetrics: [],
      requiresGPS: false,
      recommendsGPS: true,
      recommendsHeartRate: true,
      supportsPower: true,
      supportsCadence: true,
      defaultRecordingInterval: 1,
      minimumDuration: 60,
      recommendsAutoPause: true,
    },
    displayConfig: {
      primaryColor: "#6b7280",
      iconName: "fitness",
      emoji: "⚡",
      primaryDistanceUnit: "kilometers",
      primaryPaceUnit: null,
      showPaceInsteadOfSpeed: false,
    },
  },
};

// ================================
// Helper Functions
// ================================

/**
 * Get activity type by ID
 */
export function getActivityType(id: ActivityTypeId): ActivityType {
  return ACTIVITY_TYPES[id];
}

/**
 * Get all activity types
 */
export function getAllActivityTypes(): ActivityType[] {
  return Object.values(ACTIVITY_TYPES);
}

/**
 * Get popular activity types
 */
export function getPopularActivityTypes(): ActivityType[] {
  return Object.values(ACTIVITY_TYPES).filter((type) => type.isPopular);
}

/**
 * Get activity types by category
 */
export function getActivityTypesByCategory(category: string): ActivityType[] {
  return Object.values(ACTIVITY_TYPES).filter(
    (type) => type.category === category,
  );
}

/**
 * Get activity types by environment
 */
export function getActivityTypesByEnvironment(
  environment: ActivityEnvironment,
): ActivityType[] {
  return Object.values(ACTIVITY_TYPES).filter(
    (type) => type.environment === environment,
  );
}

/**
 * Check if a metric is supported for an activity type
 */
export function isMetricSupported(
  activityTypeId: ActivityTypeId,
  metric: RecordableMetric,
): boolean {
  const activityType = getActivityType(activityTypeId);
  return (
    activityType.recordingConstraints.availableMetrics.includes(metric) &&
    !activityType.recordingConstraints.excludedMetrics.includes(metric)
  );
}

/**
 * Check if a metric is required for an activity type
 */
export function isMetricRequired(
  activityTypeId: ActivityTypeId,
  metric: RecordableMetric,
): boolean {
  const activityType = getActivityType(activityTypeId);
  return activityType.recordingConstraints.requiredMetrics.includes(metric);
}

/**
 * Get the primary color for an activity type
 */
export function getActivityTypeColor(activityTypeId: ActivityTypeId): string {
  return getActivityType(activityTypeId).displayConfig.primaryColor;
}

/**
 * Get the icon name for an activity type
 */
export function getActivityTypeIcon(activityTypeId: ActivityTypeId): string {
  return getActivityType(activityTypeId).displayConfig.iconName;
}

/**
 * Get the emoji for an activity type
 */
export function getActivityTypeEmoji(activityTypeId: ActivityTypeId): string {
  return getActivityType(activityTypeId).displayConfig.emoji;
}

/**
 * Check if GPS is required for an activity type
 */
export function requiresGPS(activityTypeId: ActivityTypeId): boolean {
  return getActivityType(activityTypeId).recordingConstraints.requiresGPS;
}

/**
 * Check if GPS is recommended for an activity type
 */
export function recommendsGPS(activityTypeId: ActivityTypeId): boolean {
  return getActivityType(activityTypeId).recordingConstraints.recommendsGPS;
}

/**
 * Check if heart rate is recommended for an activity type
 */
export function recommendsHeartRate(activityTypeId: ActivityTypeId): boolean {
  return getActivityType(activityTypeId).recordingConstraints
    .recommendsHeartRate;
}

/**
 * Check if auto-pause is recommended for an activity type
 */
export function recommendsAutoPause(activityTypeId: ActivityTypeId): boolean {
  return getActivityType(activityTypeId).recordingConstraints
    .recommendsAutoPause;
}
