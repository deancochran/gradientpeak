import { expect, test } from "../fixtures";
import { completeManualNativeAcceptance } from "./current-candidate-support";

test("current Android candidate reaches the selected Home planned-session detail", async ({
  onboardingActor: actor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const prepared = await completeManualNativeAcceptance({
    actor,
    e2eDatabase,
    e2eIdentity,
    testInfo,
    workspaceOnly: true,
  });
  expect(prepared.manualSession.status).toBe("scheduled");
});
