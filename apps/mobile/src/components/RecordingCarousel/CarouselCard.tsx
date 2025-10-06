import React, { memo } from "react";
import { Dimensions } from "react-native";
import { PublicActivityType } from "@repo/core";
import { PowerCard } from "./cards/PowerCard";
import { HeartRateCard } from "./cards/HeartRateCard";
import { AnalysisCard } from "./cards/AnalysisCard";
import { ElevationCard } from "./cards/ElevationCard";
import { EnhancedPlanCard } from "./cards/EnhancedPlanCard";
import { DashboardCard } from "./cards/DashboardCard";
import { MapCard } from "./cards/MapCard";

const SCREEN_WIDTH = Dimensions.get("window").width;

type CarouselCard =
  | "dashboard"
  | "power"
  | "heartrate"
  | "analysis"
  | "elevation"
  | "map"
  | "plan";

interface RecordModalCardProps {
  type: CarouselCard;
  state: string;
  activityType: PublicActivityType;
  planProgress?: any;
  activityPlan?: any;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  service: any;
}

export const RecordModalCard = memo(
  ({
    type,
    state,
    activityType,
    planProgress,
    activityPlan,
    latitude,
    longitude,
    altitude,
    service,
  }: RecordModalCardProps) => {
    switch (type) {
      case "dashboard":
        return <DashboardCard service={service} screenWidth={SCREEN_WIDTH} />;

      case "power":
        return <PowerCard service={service} screenWidth={SCREEN_WIDTH} />;

      case "heartrate":
        return <HeartRateCard service={service} screenWidth={SCREEN_WIDTH} />;

      case "analysis":
        return <AnalysisCard service={service} screenWidth={SCREEN_WIDTH} />;

      case "elevation":
        return <ElevationCard service={service} screenWidth={SCREEN_WIDTH} />;

      case "map":
        return (
          <MapCard
            screenWidth={SCREEN_WIDTH}
            latitude={latitude}
            longitude={longitude}
            altitude={altitude}
          />
        );

      case "plan":
        return (
          <EnhancedPlanCard
            planProgress={planProgress}
            activityPlan={activityPlan}
            state={state}
            service={service}
            style={{ width: SCREEN_WIDTH }}
            className="flex-1 p-4"
          />
        );

      default:
        return null;
    }
  },
);

RecordModalCard.displayName = "RecordModalCard";
