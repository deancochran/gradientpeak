import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useCallback, useEffect, useState } from "react";

import { ensureCurrentBrowserContractEpoch } from "../../lib/contract-epoch";

type RecordingStorageState = "checking" | "ready" | "blocked";

export function RecordingStorageBoundary({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RecordingStorageState>("checking");

  const prepare = useCallback(() => {
    setState("checking");
    void ensureCurrentBrowserContractEpoch().then(
      () => setState("ready"),
      () => setState("blocked"),
    );
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  if (state === "ready") return children;

  return (
    <div className="mx-auto max-w-2xl py-4">
      <Card aria-live="polite">
        <CardHeader>
          <CardTitle>
            {state === "blocked" ? "Recorder storage is blocked" : "Preparing recorder"}
          </CardTitle>
          <CardDescription>
            {state === "blocked"
              ? "Close other GradientPeak recording tabs, then retry."
              : "Checking this browser for saved recording data."}
          </CardDescription>
        </CardHeader>
        {state === "blocked" ? (
          <CardContent>
            <Button onClick={prepare} type="button">
              Retry
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
