import React from "react";
import { vi } from "vitest";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("react-native-svg", () => {
  type MockSvgProps = React.PropsWithChildren<Record<string, unknown>>;
  const MockSvg = ({ children, ...props }: MockSvgProps) =>
    React.createElement("svg", props, children);
  const MockCircle = ({ children, ...props }: MockSvgProps) =>
    React.createElement("circle", props, children);

  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockCircle,
  };
});

vi.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  const assertValidKey = (key: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new Error(
        'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
      );
    }
  };

  return {
    getItemAsync: vi.fn(async (key: string) => {
      assertValidKey(key);
      return store.get(key) ?? null;
    }),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      assertValidKey(key);
      store.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      assertValidKey(key);
      store.delete(key);
    }),
    __store: store,
  };
});
