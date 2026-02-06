import { describe, it, expect } from "vitest";
import {
  deriveSpeedCurveFromThresholdPace,
  paceToSpeed,
  speedToPace,
  formatPace,
  parsePace,
  estimateSpeedForDuration,
  STANDARD_SPEED_DURATIONS,
  SPEED_MULTIPLIERS,
} from "../speed-curve";

describe("deriveSpeedCurveFromThresholdPace", () => {
  it("should generate 10 speed efforts from threshold pace", () => {
    const thresholdPace = 270; // 4:30/km
    const curve = deriveSpeedCurveFromThresholdPace(thresholdPace);

    expect(curve).toHaveLength(10);
    expect(curve.length).toBe(STANDARD_SPEED_DURATIONS.length);
  });

  it("should have correct format for all efforts", () => {
    const thresholdPace = 300; // 5:00/km
    const curve = deriveSpeedCurveFromThresholdPace(thresholdPace);

    curve.forEach((effort) => {
      expect(effort.effort_type).toBe("speed");
      expect(effort.unit).toBe("meters_per_second");
      expect(effort.activity_category).toBe("run");
      expect(effort.value).toBeGreaterThan(0);
      expect(effort.duration_seconds).toBeGreaterThan(0);
    });
  });

  it("should have sprint efforts faster than threshold", () => {
    const thresholdPace = 300; // 5:00/km
    const thresholdSpeed = paceToSpeed(thresholdPace);
    const curve = deriveSpeedCurveFromThresholdPace(thresholdPace);

    const sprintEffort = curve[0]; // 5 seconds
    expect(sprintEffort!.value).toBeGreaterThan(thresholdSpeed);
  });

  it("should have tempo efforts slower than threshold", () => {
    const thresholdPace = 300; // 5:00/km
    const thresholdSpeed = paceToSpeed(thresholdPace);
    const curve = deriveSpeedCurveFromThresholdPace(thresholdPace);

    const tempoEffort = curve[curve.length - 1]; // 60 minutes
    expect(tempoEffort!.value).toBeLessThan(thresholdSpeed);
  });

  it("should throw error for invalid pace", () => {
    expect(() => deriveSpeedCurveFromThresholdPace(0)).toThrow();
    expect(() => deriveSpeedCurveFromThresholdPace(-100)).toThrow();
    expect(() => deriveSpeedCurveFromThresholdPace(100)).toThrow(); // Too fast
    expect(() => deriveSpeedCurveFromThresholdPace(700)).toThrow(); // Too slow
  });
});

describe("paceToSpeed and speedToPace", () => {
  it("should convert pace to speed correctly", () => {
    const pace = 300; // 5:00/km
    const speed = paceToSpeed(pace);
    expect(speed).toBeCloseTo(3.33, 2);
  });

  it("should convert speed to pace correctly", () => {
    const speed = 3.33; // m/s
    const pace = speedToPace(speed);
    expect(pace).toBeCloseTo(300, 0);
  });

  it("should be inverse operations", () => {
    const originalPace = 270; // 4:30/km
    const speed = paceToSpeed(originalPace);
    const convertedPace = speedToPace(speed);
    expect(convertedPace).toBe(originalPace);
  });

  it("should throw error for invalid inputs", () => {
    expect(() => paceToSpeed(0)).toThrow();
    expect(() => paceToSpeed(-10)).toThrow();
    expect(() => speedToPace(0)).toThrow();
    expect(() => speedToPace(-1)).toThrow();
  });
});

describe("formatPace and parsePace", () => {
  it("should format pace correctly", () => {
    expect(formatPace(270)).toBe("4:30");
    expect(formatPace(300)).toBe("5:00");
    expect(formatPace(615)).toBe("10:15");
  });

  it("should parse pace correctly", () => {
    expect(parsePace("4:30")).toBe(270);
    expect(parsePace("5:00")).toBe(300);
    expect(parsePace("10:15")).toBe(615);
  });

  it("should be inverse operations", () => {
    const originalPace = 315; // 5:15
    const formatted = formatPace(originalPace);
    const parsed = parsePace(formatted);
    expect(parsed).toBe(originalPace);
  });

  it("should throw error for invalid pace string", () => {
    expect(() => parsePace("invalid")).toThrow();
    expect(() => parsePace("4")).toThrow();
    expect(() => parsePace("4:")).toThrow();
    expect(() => parsePace("4:70")).toThrow(); // Invalid seconds
  });
});

describe("estimateSpeedForDuration", () => {
  it("should calculate speed for specific duration", () => {
    const thresholdPace = 300; // 5:00/km
    const thresholdSpeed = paceToSpeed(thresholdPace);

    const sprintSpeed = estimateSpeedForDuration(thresholdPace, 30);
    expect(sprintSpeed).toBeCloseTo(
      thresholdSpeed * SPEED_MULTIPLIERS.sprint,
      2,
    );

    const thresholdSpeed300 = estimateSpeedForDuration(thresholdPace, 600);
    expect(thresholdSpeed300).toBeCloseTo(
      thresholdSpeed * SPEED_MULTIPLIERS.threshold,
      2,
    );
  });

  it("should match curve values", () => {
    const thresholdPace = 300;
    const curve = deriveSpeedCurveFromThresholdPace(thresholdPace);

    const fiveMinEffort = curve.find((e) => e.duration_seconds === 300);
    expect(fiveMinEffort).toBeDefined();
    const calculatedSpeed = estimateSpeedForDuration(thresholdPace, 300);

    expect(calculatedSpeed).toBeCloseTo(fiveMinEffort!.value, 2);
  });

  it("should throw error for invalid inputs", () => {
    expect(() => estimateSpeedForDuration(0, 300)).toThrow();
    expect(() => estimateSpeedForDuration(300, 0)).toThrow();
  });
});
