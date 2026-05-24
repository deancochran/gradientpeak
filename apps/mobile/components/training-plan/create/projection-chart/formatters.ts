import { format } from "date-fns";

export const formatIsoDate = (isoDate: string, pattern: string) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return format(date, pattern);
};

export const formatCompactAxisNumber = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
};

export const formatWeeklyTss = (value: number) => `~${value.toFixed(1)}`;

export const toPercentReductionLabel = (factor: number) => {
  const reduction = Math.max(0, Math.min(1, 1 - factor));
  return `${Math.round(reduction * 100)}%`;
};
