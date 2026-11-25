import type { ReactNode } from "react";

/**
 * A deliberately small identity hierarchy. Apps shape domain data, ownership,
 * navigation, and actions; this component only presents their resulting regions.
 */
export type IdentitySummaryProps = {
  action?: ReactNode;
  className?: string;
  status?: ReactNode;
  supporting?: ReactNode;
  title: string;
  titleAs?: "h2" | "h3" | "p";
  titleClassName?: string;
  titleNumberOfLines?: number;
};
