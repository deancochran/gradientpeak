import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import React, { memo } from "react";
import { Dimensions } from "react-native";
import type { CarouselCardType } from "types/carousel";
import { AnalysisCard } from "./cards/AnalysisCard";
import { DashboardCard } from "./cards/DashboardCard";
import { ElevationCard } from "./cards/ElevationCard";
import { EnhancedPlanCard } from "./cards/EnhancedPlanCard";
import { HeartRateCard } from "./cards/HeartRateCard";
import { MapCard } from "./cards/MapCard";
import { PowerCard } from "./cards/PowerCard";
import { TrainerControlCard } from "./cards/TrainerControlCard";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface CarouselCardProps {
  type: CarouselCardType;
  service: ActivityRecorderService | null;
}

export const CarouselCard = memo(
  ({ type, service }: CarouselCardProps) => {
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
        return <MapCard service={service} screenWidth={SCREEN_WIDTH} />;

      case "plan":
        return (
          <EnhancedPlanCard service={service} screenWidth={SCREEN_WIDTH} />
        );

      case "trainer":
        return (
          <TrainerControlCard service={service} screenWidth={SCREEN_WIDTH} />
        );

      default:
        return null;
    }
  },
  (prevProps, nextProps) => {
    // Only re-render if card type changes
    // Service instance stays the same throughout the session
    return prevProps.type === nextProps.type;
  },
);

CarouselCard.displayName = "CarouselCard";
