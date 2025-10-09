/**
 * Carousel Types
 *
 * Defines the data structure for RecordingCarousel configuration.
 * Using a configuration object instead of a simple array prevents
 * ordering issues and allows for extensibility.
 */

export type CarouselCardType =
  | "dashboard"
  | "power"
  | "heartrate"
  | "analysis"
  | "elevation"
  | "map"
  | "plan";

/**
 * Configuration for a single carousel card
 */
export interface CarouselCardConfig {
  /** Unique identifier for the card */
  id: CarouselCardType;
  /** Whether the card is currently enabled/visible */
  enabled: boolean;
  /** Display order (lower numbers appear first) */
  order: number;
  // Future extensibility:
  // settings?: Record<string, any>;
  // isFavorite?: boolean;
  // customLabel?: string;
  // lastViewed?: number;
}

/**
 * Complete carousel state
 */
export interface CarouselState {
  /** Configuration for all available cards */
  cards: Record<CarouselCardType, CarouselCardConfig>;
  /** Currently active/selected card */
  activeCardId: CarouselCardType;
}

/**
 * Helper function to get sorted, enabled cards from configuration
 */
export function getEnabledCards(
  cards: Record<CarouselCardType, CarouselCardConfig>
): CarouselCardType[] {
  return Object.values(cards)
    .filter((card) => card.enabled)
    .sort((a, b) => a.order - b.order)
    .map((card) => card.id);
}

/**
 * Helper function to create default card configuration
 */
export function createDefaultCardConfig(
  cardId: CarouselCardType,
  order: number,
  enabled = true
): CarouselCardConfig {
  return {
    id: cardId,
    enabled,
    order,
  };
}

/**
 * Default card order - can be used to initialize configuration
 */
export const DEFAULT_CARD_ORDER: CarouselCardType[] = [
  "dashboard",
  "power",
  "heartrate",
  "analysis",
  "elevation",
  "map",
  "plan",
];

/**
 * Creates a complete default cards configuration
 */
export function createDefaultCardsConfig(): Record<
  CarouselCardType,
  CarouselCardConfig
> {
  return {
    dashboard: createDefaultCardConfig("dashboard", 0, true),
    power: createDefaultCardConfig("power", 1, true),
    heartrate: createDefaultCardConfig("heartrate", 2, true),
    analysis: createDefaultCardConfig("analysis", 3, true),
    elevation: createDefaultCardConfig("elevation", 4, true),
    map: createDefaultCardConfig("map", 5, false), // Disabled by default
    plan: createDefaultCardConfig("plan", 6, false), // Disabled by default
  };
}
