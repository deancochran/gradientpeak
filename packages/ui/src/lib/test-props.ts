import type { AccessibilityRole } from "react-native";

export type TestProps = {
  accessibilityLabel?: string;
  id?: string;
  nativeID?: string;
  role?: string;
  testID?: string;
  testId?: string;
};

export type WebTestProps = {
  "aria-label"?: string;
  "data-testid"?: string;
  id?: string;
  role?: string;
};

export type NativeTestProps = {
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  nativeID?: string;
  role?: AccessibilityRole;
  testID?: string;
};

function compactProps<T extends Record<string, string | undefined>>(props: T) {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as {
    [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined>;
  };
}

export function getWebTestProps({
  accessibilityLabel,
  id,
  role,
  testId,
  testID,
}: TestProps): WebTestProps {
  return compactProps({
    "aria-label": accessibilityLabel,
    "data-testid": testId ?? testID,
    id,
    role,
  });
}

export function getNativeTestProps({
  accessibilityLabel,
  id,
  nativeID,
  role,
  testID,
  testId,
}: TestProps): NativeTestProps {
  return compactProps({
    accessibilityLabel,
    accessibilityRole: role as AccessibilityRole | undefined,
    nativeID: id ?? nativeID,
    role: role as AccessibilityRole | undefined,
    testID: testId ?? testID,
  });
}

export function withTestIdSuffix(testId: string | undefined, suffix: string) {
  return testId ? `${testId}-${suffix}` : undefined;
}
