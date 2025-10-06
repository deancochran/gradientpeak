import { PublicActivityType } from "@repo/core";
import React, { memo } from "react";
import { Dimensions } from "react-native";
import { AnalysisCard } from "./cards/AnalysisCard";
import { DashboardCard } from "./cards/DashboardCard";
import { ElevationCard } from "./cards/ElevationCard";
import { EnhancedPlanCard } from "./cards/EnhancedPlanCard";
import { HeartRateCard } from "./cards/HeartRateCard";
import { MapCard } from "./cards/MapCard";
import { PowerCard } from "./cards/PowerCard";

const SCREEN_WIDTH = Dimensions.get("window").width;

type CarouselCardType =
  | "dashboard"
  | "power"
  | "heartrate"
  | "analysis"
  | "elevation"
  | "map"
  | "plan";

interface CarouselCardProps {
  type: CarouselCardType;
  state: string;
  activityType: PublicActivityType;
  planProgress?: any;
  activityPlan?: any;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  service: any;
}

export const CarouselCard = memo(
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
  }: CarouselCardProps) => {
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

CarouselCard.displayName = "CarouselCard";
