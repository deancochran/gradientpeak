import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export const useAnimatedValue = (value: number, duration = 300) => {
  const animatedValue = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();
  }, [value, duration, animatedValue]);

  return animatedValue;
};

export const useAnimatedScale = (trigger: boolean, duration = 200) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const scale = trigger ? 1.05 : 1;
    Animated.timing(scaleValue, {
      toValue: scale,
      duration,
      useNativeDriver: true,
    }).start();
  }, [trigger, duration, scaleValue]);

  return scaleValue;
};

export const useAnimatedOpacity = (visible: boolean, duration = 250) => {
  const opacityValue = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacityValue, {
      toValue: visible ? 1 : 0,
      duration,
      useNativeDriver: true,
    }).start();
  }, [visible, duration, opacityValue]);

  return opacityValue;
};

export const useAnimatedHeight = (height: number, duration = 500) => {
  const heightValue = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    Animated.timing(heightValue, {
      toValue: height,
      duration,
      useNativeDriver: false,
    }).start();
  }, [height, duration, heightValue]);

  return heightValue;
};
