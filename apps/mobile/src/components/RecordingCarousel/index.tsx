import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, View } from "react-native";
import { CarouselCard } from "./CarouselCard";

const SCREEN_WIDTH = Dimensions.get("window").width;

type CarouselCardType =
  | "dashboard"
  | "power"
  | "heartrate"
  | "analysis"
  | "elevation"
  | "map"
  | "plan";

interface RecordingCarouselProps {
  cards: CarouselCardType[];
  service: ActivityRecorderService | null;
}

export const RecordingCarousel = memo(
  ({ cards, service }: RecordingCarouselProps) => {
    const carouselRef = useRef<FlatList>(null);
    const isScrolling = useRef(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);

    // Create infinite scrolling by tripling the cards array
    const infiniteCards = useMemo(() => {
      return [...cards, ...cards, ...cards];
    }, [cards]);

    // Reset carousel to middle set whenever cards array changes
    useEffect(() => {
      setCurrentCardIndex(0);
      const middleIndex = cards.length;
      setTimeout(() => {
        carouselRef.current?.scrollToIndex({
          index: middleIndex,
          animated: false,
          viewPosition: 0,
        });
      }, 50);
    }, [cards.length]);

    const handleMomentumScrollEnd = (event: any) => {
      if (isScrolling.current) return;

      const offsetX = event.nativeEvent.contentOffset.x;
      const absoluteIndex = Math.round(offsetX / SCREEN_WIDTH);

      // Calculate which set we're in (0=first, 1=middle, 2=last)
      const setIndex = Math.floor(absoluteIndex / cards.length);
      const relativeIndex = absoluteIndex % cards.length;

      // Update indicator to show relative position
      setCurrentCardIndex(relativeIndex);

      // If we've scrolled to first or last set, snap back to middle set
      if (setIndex === 0 || setIndex === 2) {
        isScrolling.current = true;
        const middleSetIndex = cards.length + relativeIndex;

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
      const offset = info.index * SCREEN_WIDTH;
      carouselRef.current?.scrollToOffset({
        offset,
        animated: false,
      });
    };

    const getItemLayout = (data: any, index: number) => ({
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
          decelerationRate="fast"
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          getItemLayout={getItemLayout}
          removeClippedSubviews={true}
          style={{ flex: 1 }}
        />

        {/* Carousel Indicators */}
        {cards.length > 1 && (
          <View className="pb-4">
            <View className="flex-row justify-center gap-2">
              {cards.map((card, index) => (
                <View
                  key={`indicator-${card}`}
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
