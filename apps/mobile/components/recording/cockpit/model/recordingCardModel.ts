import type { RecordingInsightCard, RecordingSessionContract } from "@repo/core";

export interface RecordingFloatingPanelModel {
  availableCards: RecordingInsightCard[];
  cardGap: number;
  cardWidth: number;
  carouselBottomOffset: number;
  carouselExpandedMaxHeight: number;
  carouselMaxHeight: number;
  canMinimize: boolean;
  compactBottomOffset: number;
  defaultCard: RecordingInsightCard;
  forcedExpanded: boolean;
  panelHorizontalInset: number;
  panelPadding: number;
  snapInterval: number;
}

export function buildRecordingFloatingPanelModel(params: {
  bottomObstructionHeight: number;
  hasClimbData: boolean;
  hasPlan: boolean;
  height: number;
  insetsBottom: number;
  sessionContract: RecordingSessionContract | null;
  width: number;
}): RecordingFloatingPanelModel {
  const cardGap = 14;
  const panelHorizontalInset = 16;
  const panelPadding = 14;
  const cardWidth = Math.round(
    Math.max(280, params.width - panelHorizontalInset * 2 - panelPadding * 2),
  );
  const carouselBottomOffset = params.bottomObstructionHeight + 6;
  const carouselMaxHeight = Math.round(
    Math.max(164, Math.min(420, params.height - carouselBottomOffset - params.insetsBottom - 56)),
  );
  const carouselExpandedMaxHeight = Math.round(
    Math.max(
      carouselMaxHeight + 80,
      Math.min(420, params.height - carouselBottomOffset - params.insetsBottom - 72),
    ),
  );
  const availableCards = getRecordingCarouselCards({
    hasClimbData: params.hasClimbData,
    hasPlan: params.hasPlan,
    sessionContract: params.sessionContract,
  });

  return {
    availableCards,
    cardGap,
    cardWidth,
    carouselBottomOffset,
    carouselExpandedMaxHeight,
    carouselMaxHeight,
    canMinimize: params.sessionContract?.ui.floatingPanel.canMinimize ?? true,
    compactBottomOffset: carouselBottomOffset,
    defaultCard: availableCards[0] ?? "metrics",
    forcedExpanded: params.sessionContract?.ui.floatingPanel.forcedExpanded ?? false,
    panelHorizontalInset,
    panelPadding,
    snapInterval: cardWidth + cardGap,
  };
}

function getRecordingCarouselCards(params: {
  hasClimbData: boolean;
  hasPlan: boolean;
  sessionContract: RecordingSessionContract | null;
}): RecordingInsightCard[] {
  const cards: RecordingInsightCard[] = [];
  const policyCards = params.sessionContract?.ui.floatingPanel.availableCards ?? [];

  for (const card of policyCards) {
    if (shouldShowRecordingCard(card, params) && !cards.includes(card)) {
      cards.push(card);
    }
  }

  if (!cards.includes("metrics")) {
    cards.push("metrics");
  }

  return cards;
}

function shouldShowRecordingCard(
  card: RecordingInsightCard,
  params: {
    hasClimbData: boolean;
    hasPlan: boolean;
    sessionContract: RecordingSessionContract | null;
  },
) {
  if (card === "metrics") return true;

  if (card === "workout_interval") {
    return params.hasPlan && (params.sessionContract?.guidance.hasStructuredSteps ?? true);
  }

  if (card === "trainer") {
    return params.sessionContract?.devices.trainerControllable === true;
  }

  if (card === "route_progress") {
    return (
      params.sessionContract?.guidance.hasRouteGeometry === true &&
      params.sessionContract.guidance.routeMode !== "live_navigation" &&
      params.sessionContract.guidance.routeMode !== "preview" &&
      params.sessionContract.guidance.routeMode !== "virtual"
    );
  }

  if (card === "climb") {
    return params.sessionContract?.guidance.hasRouteGeometry === true && params.hasClimbData;
  }

  return false;
}

export function getRecordingCardShortLabel(card: RecordingInsightCard) {
  if (card === "workout_interval") return "Activity Plan";
  if (card === "route_progress") return "Route";
  if (card === "climb") return "Climb";
  if (card === "trainer") return "Trainer Control";
  return "Metrics";
}
