import type { TestProps } from "../../lib/test-props";

export type AvatarPlatform = "web" | "native";

export type AvatarTestProps = TestProps;

export type AvatarClassNameOptions = AvatarTestProps & {
  className?: string;
};
