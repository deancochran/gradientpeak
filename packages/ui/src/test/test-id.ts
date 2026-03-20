import { withTestIdSuffix } from "../lib/test-props";

export function getTestId(testId: string, suffix?: string) {
  return suffix ? withTestIdSuffix(testId, suffix) : testId;
}
