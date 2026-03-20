import type { TestProps } from "../../lib/test-props";

export type TabsListVariant = "default" | "line";

export type TabsPlatform = "native" | "web";

export const TABS_TEST_SLOTS = ["list", "trigger", "content"] as const;

export type TabsTestProps = TestProps;

export type TabsListOptions = TabsTestProps & {
  className?: string;
  variant?: TabsListVariant;
};

export type TabsTriggerOptions = TabsTestProps & {
  active?: boolean;
  className?: string;
  disabled?: boolean;
};

export type TabsContentOptions = TabsTestProps & {
  className?: string;
};
