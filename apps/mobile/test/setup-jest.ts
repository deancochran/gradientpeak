import React from "react";

import "@repo/ui/test/setup-native";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      scheme: "gradientpeak-dev",
      extra: {
        redirectUri: "gradientpeak-dev://integrations",
      },
    },
  },
}));

jest.mock("expo-linking", () => ({
  __esModule: true,
  createURL: jest.fn((path = "") => `gradientpeak-dev://${String(path).replace(/^\//, "")}`),
}));

jest.mock("react-native-svg", () => {
  const MockSvg = ({ children, ...props }: any) => React.createElement("svg", props, children);
  const MockCircle = ({ children, ...props }: any) =>
    React.createElement("circle", props, children);

  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockCircle,
  };
});

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();

  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});
