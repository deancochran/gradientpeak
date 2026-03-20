import type { TestProps } from "../../lib/test-props";

export type AccordionPlatform = "native" | "web";

export type AccordionTestProps = Omit<TestProps, "role">;

export type AccordionContentClassNameOptions = {
  className?: string;
  isExpanded?: boolean;
};
