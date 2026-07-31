import type { Browser, Page, TestInfo } from "@playwright/test";

export type FutureJourneyActor =
  | "anonymous"
  | "athlete"
  | "authLane"
  | "coach"
  | "messaging"
  | "onboarding"
  | "profile"
  | "unverified";

export type FutureJourneyCheckpoint =
  | {
      kind: "label";
      purpose: string;
      value: string;
    }
  | {
      kind: "role";
      name: string;
      purpose: string;
      role: Parameters<Page["getByRole"]>[0];
    }
  | {
      kind: "testId";
      purpose: string;
      value: string;
    }
  | {
      kind: "testIdPrefix";
      purpose: string;
      value: string;
    }
  | {
      kind: "text";
      purpose: string;
      value: string;
    }
  | {
      kind: "url";
      purpose: string;
      value: string;
    };

export type FutureJourneyBlueprint = {
  acceptance: readonly [string, ...string[]];
  actor: FutureJourneyActor;
  checkpoints: readonly [FutureJourneyCheckpoint, ...FutureJourneyCheckpoint[]];
  id: string;
  path: string;
  prerequisites: readonly [string, ...string[]];
  viewport?: {
    height: number;
    width: number;
  };
};

export type FutureJourneyExecutorContext = {
  baseURL?: string;
  blueprint: FutureJourneyBlueprint;
  browser?: Browser;
  page: Page;
  testInfo: TestInfo;
};

export type FutureJourneyExecutor = (context: FutureJourneyExecutorContext) => Promise<void>;
