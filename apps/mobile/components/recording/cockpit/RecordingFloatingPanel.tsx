import type { RecordingInsightCard, RecordingSessionContract } from "@repo/core";
import { Minimize2 } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentReadings, usePlan, useSessionStats } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  ClimbInsightCard,
  MetricsInsightCard,
  RouteProgressInsightCard,
  TrainerInsightCard,
  WorkoutIntervalInsightCard,
} from "./cards";
import { buildRecordingFloatingPanelModel } from "./model/recordingCardModel";

export interface RecordingFloatingPanelProps {
  sessionContract: RecordingSessionContract | null;
  sensorCount: number;
  service: ActivityRecorderService | null;
  hasPlan: boolean;
  bottomObstructionHeight: number;
}

export function RecordingFloatingPanel({
  bottomObstructionHeight,
  hasPlan,
  sensorCount,
  service,
  sessionContract,
}: RecordingFloatingPanelProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const hasClimbData = Boolean(
    service?.currentRoute?.elevation_profile?.length &&
      service.currentRoute.elevation_profile.length > 1,
  );
  const model = React.useMemo(
    () =>
      buildRecordingFloatingPanelModel({
        bottomObstructionHeight,
        hasClimbData,
        hasPlan,
        height,
        insetsBottom: insets.bottom,
        sessionContract,
        width,
      }),
    [bottomObstructionHeight, hasClimbData, hasPlan, height, insets.bottom, sessionContract, width],
  );
  const availableCardsKey = model.availableCards.join("|");
  const [selectedCard, setSelectedCard] = React.useState<RecordingInsightCard>(model.defaultCard);
  const [expanded, setExpanded] = React.useState(model.forcedExpanded);
  const wasForcedExpanded = React.useRef(model.forcedExpanded);
  const effectiveExpanded = model.forcedExpanded || expanded;
  const readings = useCurrentReadings(service);
  const stats = useSessionStats(service);
  const plan = usePlan(service);
  const insightProps = {
    mode: effectiveExpanded ? ("expanded" as const) : ("compact" as const),
    readings,
    sensorCount,
    service,
    sessionContract,
    stats,
    plan,
  };
  const panelClassName = effectiveExpanded
    ? "absolute bg-background shadow-xl"
    : "absolute overflow-hidden rounded-[28px] border border-border bg-background py-2 shadow-xl";
  const expandedHorizontalInset = Math.max(20, insets.left + 20, insets.right + 20);
  const expandedTopInset = Math.max(18, insets.top + 12);
  const expandedHeaderHeight = model.canMinimize && !model.forcedExpanded ? 52 : 0;
  const expandedIndicatorBottom = bottomObstructionHeight + Math.max(12, insets.bottom + 8);
  const expandedIndicatorHeight = 18;
  const expandedCarouselTop = expandedTopInset + expandedHeaderHeight;
  const expandedCarouselBottom = expandedIndicatorBottom + expandedIndicatorHeight + 14;
  const expandedContentHeight = Math.max(
    320,
    height - expandedCarouselTop - expandedCarouselBottom,
  );
  const compactIndicatorHeight = model.availableCards.length > 1 ? 16 : 0;
  const compactPanelMinHeight = getCompactPanelMinHeight(height, compactIndicatorHeight);
  const compactCardHeight = Math.max(132, compactPanelMinHeight - compactIndicatorHeight - 16);
  const panelStyle = effectiveExpanded
    ? {
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
      }
    : {
        bottom: model.carouselBottomOffset,
        left: model.panelHorizontalInset,
        maxHeight: model.carouselMaxHeight,
        minHeight: compactPanelMinHeight,
        right: model.panelHorizontalInset,
      };
  const pageWidth = effectiveExpanded ? width - expandedHorizontalInset * 2 : model.cardWidth;
  const snapInterval = effectiveExpanded ? pageWidth : model.snapInterval;

  React.useEffect(() => {
    setSelectedCard((current) => {
      if (model.availableCards.includes(current)) {
        return current;
      }

      return model.defaultCard;
    });
  }, [availableCardsKey, model.availableCards, model.defaultCard]);

  React.useEffect(() => {
    if (model.forcedExpanded) {
      setExpanded(true);
      wasForcedExpanded.current = true;
      return;
    }

    if (wasForcedExpanded.current) {
      setExpanded(false);
    }
    wasForcedExpanded.current = false;
  }, [model.forcedExpanded]);

  const handleScrollEnd = React.useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / snapInterval);
      const nextCard = model.availableCards[index];

      if (nextCard) {
        setSelectedCard(nextCard);
      }
    },
    [model.availableCards, snapInterval],
  );
  const handleExpand = React.useCallback(() => {
    if (!effectiveExpanded) {
      setExpanded(true);
    }
  }, [effectiveExpanded]);
  const handleMinimize = React.useCallback(() => {
    if (model.canMinimize && !model.forcedExpanded) {
      setExpanded(false);
    }
  }, [model.canMinimize, model.forcedExpanded]);

  return (
    <View className="absolute inset-0" pointerEvents="box-none" testID="recording-floating-panel">
      <View className={panelClassName} pointerEvents="auto" style={panelStyle}>
        {effectiveExpanded && model.canMinimize && !model.forcedExpanded ? (
          <Pressable
            accessibilityLabel="Minimize recording cards"
            accessibilityRole="button"
            className="absolute z-10 h-10 w-10 items-center justify-center rounded-full border border-border bg-card/95 active:opacity-80"
            hitSlop={8}
            onPress={handleMinimize}
            style={{ right: expandedHorizontalInset, top: expandedTopInset }}
            testID="recording-card-minimize-button"
          >
            <Minimize2 size={18} className="text-foreground" />
          </Pressable>
        ) : null}

        <ScrollView
          horizontal
          accessibilityLabel="Recording insight cards"
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          snapToAlignment="start"
          style={
            effectiveExpanded
              ? {
                  bottom: expandedCarouselBottom,
                  left: 0,
                  position: "absolute",
                  right: 0,
                  top: expandedCarouselTop,
                }
              : { height: compactCardHeight }
          }
          contentContainerStyle={{
            paddingHorizontal: effectiveExpanded ? expandedHorizontalInset : model.panelPadding,
          }}
          testID="recording-card-carousel"
        >
          {model.availableCards.map((availableCard, index) => {
            const cardStyle = {
              marginRight: index === model.availableCards.length - 1 ? 0 : model.cardGap,
              height: effectiveExpanded ? expandedContentHeight : compactCardHeight,
              minHeight: effectiveExpanded ? expandedContentHeight : compactCardHeight,
              width: pageWidth,
            };
            const cardContent = effectiveExpanded ? (
              <ScrollView
                className="overflow-hidden"
                contentContainerStyle={{ minHeight: expandedContentHeight, paddingBottom: 20 }}
                contentInsetAdjustmentBehavior="automatic"
                showsVerticalScrollIndicator={false}
                style={{ height: expandedContentHeight }}
              >
                <InsightCard card={availableCard} props={insightProps} />
              </ScrollView>
            ) : (
              <View className="h-full overflow-hidden">
                <InsightCard card={availableCard} props={insightProps} />
              </View>
            );

            if (effectiveExpanded) {
              return (
                <View
                  key={availableCard}
                  style={cardStyle}
                  testID={`recording-card-${availableCard}`}
                >
                  {cardContent}
                </View>
              );
            }

            return (
              <Pressable
                key={availableCard}
                accessibilityLabel="Expand recording cards"
                accessibilityRole="button"
                onPress={handleExpand}
                style={cardStyle}
                testID={`recording-card-${availableCard}-surface`}
              >
                {cardContent}
              </Pressable>
            );
          })}
        </ScrollView>

        <View
          className={
            effectiveExpanded
              ? "absolute left-0 right-0 flex-row justify-center gap-1.5"
              : "mt-2 flex-row justify-center gap-1.5"
          }
          style={effectiveExpanded ? { bottom: expandedIndicatorBottom } : undefined}
          testID="recording-card-page-indicator"
        >
          {model.availableCards.map((availableCard) => (
            <View
              key={availableCard}
              className={
                availableCard === selectedCard
                  ? "h-1.5 w-5 rounded-full bg-foreground"
                  : "h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
              }
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function getCompactPanelMinHeight(height: number, indicatorHeight: number) {
  return Math.round(Math.max(128, Math.min(160, height * 0.17))) + indicatorHeight;
}

function InsightCard({
  card,
  props,
}: {
  card: RecordingInsightCard;
  props: React.ComponentProps<typeof MetricsInsightCard>;
}) {
  switch (card) {
    case "workout_interval":
      return <WorkoutIntervalInsightCard {...props} />;
    case "route_progress":
      return <RouteProgressInsightCard {...props} />;
    case "climb":
      return <ClimbInsightCard {...props} />;
    case "trainer":
      return <TrainerInsightCard {...props} />;
    case "metrics":
    default:
      return <MetricsInsightCard {...props} />;
  }
}
