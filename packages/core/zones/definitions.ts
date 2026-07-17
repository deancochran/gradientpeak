export interface NumericRange {
  min: number;
  max: number;
}

export type ZoneRange = NumericRange;

export interface FiveZoneRanges {
  zone1: NumericRange;
  zone2: NumericRange;
  zone3: NumericRange;
  zone4: NumericRange;
  zone5: NumericRange;
}
