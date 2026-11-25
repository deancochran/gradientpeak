/** Decoded activity-stream shape shared by analysis and zone calculations. */
export type PublicActivityMetric = string;
export type PublicActivityMetricDataType = "float" | "latlng" | "boolean";

export interface AggregatedStream {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[] | number[][];
  timestamps: number[];
  sampleCount: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
}
