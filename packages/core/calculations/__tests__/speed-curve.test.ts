import { describe, expect, it } from "vitest";
import { formatPace, paceToSpeed, parsePace, speedToPace } from "../speed-curve";

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
