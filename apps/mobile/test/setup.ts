import React from "react";
import { vi } from "vitest";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native-svg", () => {
  const MockSvg = ({ children, ...props }: any) =>
    React.createElement("svg", props, children);
  const MockCircle = ({ children, ...props }: any) =>
    React.createElement("circle", props, children);

  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockCircle,
  };
});
