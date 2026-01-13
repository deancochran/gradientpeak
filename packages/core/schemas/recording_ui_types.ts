/**
 * Recording UI Types
 *
 * Type definitions for the reactive recording interface (3-zone vertical stack).
 * These types define the UI state for zones, focus modes, and footer behavior.
 */

// ============================================================================
// Recording State
// ============================================================================

/**
 * Current state of the recording
 * - not_started: Before "Start" button is pressed
 * - recording: Activity is actively recording
 * - paused: Recording is temporarily paused
 * - finished: Recording has completed (navigates to submit screen)
 */
export type RecordingState = "not_started" | "recording" | "paused" | "finished";

// ============================================================================
// Zone Rendering States
// ============================================================================

/**
 * Visibility state for each zone in the 3-zone stack
 * Zones can be:
 * - visible: Zone is rendered and displayed
 * - hidden: Zone is unmounted (not rendered)
 */
export interface ZoneRenderingStates {
  zoneA: boolean; // Context Layer (Map/Route)
  zoneB: boolean; // Guidance Layer (Plan/Intervals)
  zoneC: boolean; // Data Layer (Metrics) - always true
}

// ============================================================================
// Focus Mode
// ============================================================================

/**
 * Current focus mode for the recording interface
 * - none: Normal view with all zones visible (collapsed/expanded)
 * - zone-a: Zone A (Map) is expanded to fill screen (except footer)
 * - zone-b: Zone B (Plan) is expanded to fill screen (except footer)
 * - zone-c: Zone C (Metrics) is expanded to fill screen (except footer)
 * - footer: Footer is expanded (zones are minimized)
 *
 * Focus modes are mutually exclusive:
 * - When a zone focuses, footer collapses first (if expanded)
 * - When footer expands, any focused zone minimizes first
 */
export type FocusMode =
  | "none"
  | "zone-a"
  | "zone-b"
  | "zone-c"
  | "footer";

// ============================================================================
// Footer Snap State
// ============================================================================

/**
 * Current snap position of the footer bottom sheet
 * - collapsed: Footer shows minimal controls (120-140px height)
 * - expanded: Footer shows full configuration grid (60-70% screen height)
 */
export type FooterSnapState = "collapsed" | "expanded";

/**
 * Footer snap points configuration for @gorhom/bottom-sheet
 * Index 0: Collapsed state (120px)
 * Index 1: Expanded state (60% of screen)
 */
export const FOOTER_SNAP_POINTS = [120, "60%"] as const;

// ============================================================================
// FTMS Machine Types
// ============================================================================

/**
 * Types of FTMS machines with their specific control parameters
 */
export type FTMSMachineType = "bike" | "rower" | "treadmill" | "elliptical";

/**
 * Bike/Trainer specific parameters
 * Modes: ERG (Mode 5), SIM (Mode 1), Resistance (Mode 4)
 */
export interface BikeControlParams {
  mode: "erg" | "sim" | "resistance";
  // ERG mode
  targetPowerWatts?: number;
  // SIM mode
  grade?: number;
  crr?: number; // Coefficient of rolling resistance
  cw?: number; // Wind resistance coefficient
  windSpeed?: number;
  draftingFactor?: number;
  // Resistance mode
  resistanceLevel?: number; // 1-20
  // Common
  weight_kg?: number; // For power calculations
  ftp?: number; // For zone display
}

/**
 * Rower specific parameters
 */
export interface RowerControlParams {
  damper?: number; // 1-10
  resistanceLevel?: number;
  targetStrokeRate?: number; // strokes per minute
  dragFactor?: number; // Read-only
}

/**
 * Treadmill specific parameters
 */
export interface TreadmillControlParams {
  speedKmh?: number;
  inclinePercent?: number;
  maxSpeedKmh?: number; // Safety limit
  maxInclinePercent?: number; // Safety limit
}

/**
 * Elliptical specific parameters
 */
export interface EllipticalControlParams {
  resistanceLevel?: number; // 1-20
  targetCadence?: number; // steps per minute
  power?: number; // Read-only
}

/**
 * Union type for all machine control parameters
 */
export type MachineControlParams =
  | BikeControlParams
  | RowerControlParams
  | TreadmillControlParams
  | EllipticalControlParams;

// ============================================================================
// FTMS Control Mode
// ============================================================================

/**
 * FTMS auto vs manual control mode
 * - auto: Machine follows plan targets automatically
 * - manual: User controls machine manually (overrides plan)
 */
export type FTMSControlMode = "auto" | "manual";

// ============================================================================
// Sensor Connection Status
// ============================================================================

/**
 * Connection status for a single sensor
 */
export interface SensorConnectionStatus {
  sensorType: "heartrate" | "power" | "cadence" | "speed";
  deviceId: string | null;
  deviceName: string | null;
  connected: boolean;
  lastValue: number | null;
  lastUpdated: number | null; // timestamp
}

/**
 * Collection of all sensor statuses
 */
export interface SensorStatuses {
  heartrate: SensorConnectionStatus;
  power: SensorConnectionStatus;
  cadence: SensorConnectionStatus;
  speed: SensorConnectionStatus;
}

// ============================================================================
// FTMS Connection Status
// ============================================================================

/**
 * Connection status for FTMS machine
 */
export interface FTMSConnectionStatus {
  connected: boolean;
  deviceId: string | null;
  deviceName: string | null;
  machineType: FTMSMachineType | null;
  controlMode: FTMSControlMode;
  currentParams: MachineControlParams | null;
}
