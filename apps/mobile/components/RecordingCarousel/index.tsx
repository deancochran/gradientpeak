import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dimensions, FlatList, View } from "react-native";
import type { CarouselCardConfig, CarouselCardType } from "types/carousel";
import { CarouselCard } from "./CarouselCard";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface RecordingCarouselProps {
  cardsConfig: Record<CarouselCardType, CarouselCardConfig>;
  service: ActivityRecorderService | null;
  onCardChange?: (cardId: CarouselCardType) => void;
}

export const RecordingCarousel = memo(
  ({ cardsConfig, service, onCardChange }: RecordingCarouselProps) => {
    const carouselRef = useRef<FlatList>(null);
    const isScrolling = useRef(false);
    const isInitialized = useRef(false);

    // Derive enabled cards in order from config
    const enabledCards = useMemo(() => {
      return Object.values(cardsConfig)
        .filter((card) => card.enabled)
        .sort((a, b) => a.order - b.order)
        .map((card) => card.id);
    }, [cardsConfig]);

    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [currentCardId, setCurrentCardId] = useState<CarouselCardType>(
      enabledCards[0] || "dashboard",
    );

    // Create infinite scrolling by tripling the cards array
    const infiniteCards = useMemo(() => {
      return [...enabledCards, ...enabledCards, ...enabledCards];
    }, [enabledCards]);

    // Initialize carousel on mount
    useEffect(() => {
      // Scroll to middle set on mount (maintains current card state)
      const middleIndex = enabledCards.length;
      setTimeout(() => {
        carouselRef.current?.scrollToIndex({
          index: middleIndex,
          animated: false,
          viewPosition: 0,
        });
        isInitialized.current = true;
      }, 50);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // Handle config changes (cards enabled/disabled, reordered)
    useEffect(() => {
      if (!isInitialized.current) return;

      // Find current card in new enabled cards list
      const cardIndex = enabledCards.indexOf(currentCardId);

      if (cardIndex !== -1) {
        // Current card still enabled, update position
        console.log(
          "[RecordingCarousel] Current card still enabled, maintaining position:",
          currentCardId,
        );
        setCurrentCardIndex(cardIndex);
        const middleSetIndex = enabledCards.length + cardIndex;
        setTimeout(() => {
          carouselRef.current?.scrollToIndex({
            index: middleSetIndex,
            animated: false,
            viewPosition: 0,
          });
        }, 50);
      } else {
        // Current card disabled/removed, fallback to first
        console.log(
          "[RecordingCarousel] Current card no longer enabled, switching to first:",
          enabledCards[0],
        );
        const firstCard = enabledCards[0] || "dashboard";
        setCurrentCardIndex(0);
        setCurrentCardId(firstCard);
        const middleIndex = enabledCards.length;
        setTimeout(() => {
          carouselRef.current?.scrollToIndex({
            index: middleIndex,
            animated: false,
            viewPosition: 0,
          });
        }, 50);
      }
    }, [enabledCards, currentCardId]);

    // Update active card callback
    const updateActiveCard = useCallback((cardId: CarouselCardType) => {
      console.log("[RecordingCarousel] User swiped to card:", cardId);
    }, []);

    const handleMomentumScrollEnd = (event: any) => {
      if (isScrolling.current) return;

      const offsetX = event.nativeEvent.contentOffset.x;
      const absoluteIndex = Math.round(offsetX / SCREEN_WIDTH);

      const setIndex = Math.floor(absoluteIndex / enabledCards.length);
      const relativeIndex = absoluteIndex % enabledCards.length;

      setCurrentCardIndex(relativeIndex);
      const newCardId = enabledCards[relativeIndex];

      if (newCardId && newCardId !== currentCardId) {
        setCurrentCardId(newCardId);
        updateActiveCard(newCardId);
        onCardChange?.(newCardId);
      }

      // Infinite scroll snap back
      if (setIndex === 0 || setIndex === 2) {
        isScrolling.current = true;
        const middleSetIndex = enabledCards.length + relativeIndex;

        setTimeout(() => {
          carouselRef.current?.scrollToIndex({
            index: middleSetIndex,
            animated: false,
          });
          isScrolling.current = false;
        }, 10);
      }
    };

    const handleScrollToIndexFailed = (info: any) => {
      console.warn("[RecordingCarousel] ScrollToIndex failed:", info);
      const offset = info.index * SCREEN_WIDTH;
      carouselRef.current?.scrollToOffset({
        offset,
        animated: false,
      });
    };

    const getItemLayout = (_data: any, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    });

    return (
      <View className="flex-1">
        <FlatList
          ref={carouselRef}
          data={infiniteCards}
          extraData={infiniteCards.length}
          renderItem={({ item }) => (
            <CarouselCard type={item} service={service} />
          )}
          keyExtractor={(item, index) => `${item}-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={SCREEN_WIDTH}
          snapToAlignment="center"
          decelerationRate="fast"
          disableIntervalMomentum
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          getItemLayout={getItemLayout}
          removeClippedSubviews={true}
          bounces={false}
          overScrollMode="never"
          style={{ flex: 1 }}
        />

        {/* Carousel Indicators */}
        {enabledCards.length > 1 && (
          <View className="pb-4">
            <View className="flex-row justify-center gap-2">
              {enabledCards.map((cardId, index) => (
                <View
                  key={`indicator-${cardId}`}
                  className={`w-2 h-2 rounded-full ${
                    index === currentCardIndex
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    );
  },
);

RecordingCarousel.displayName = "RecordingCarousel";
