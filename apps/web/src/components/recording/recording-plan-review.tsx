import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type { ReactNode } from "react";

type RecordingPlanReviewProps = {
  children: ReactNode;
  description: string;
  onChooseAnother: () => void;
  onRecordWithoutPlan: () => void;
  onUse: () => void;
  title: string;
  useDisabled: boolean;
};

/** Keeps the selected plan's review and recording choices next to its picker card. */
export function RecordingPlanReview({
  children,
  description,
  onChooseAnother,
  onRecordWithoutPlan,
  onUse,
  title,
  useDisabled,
}: RecordingPlanReviewProps) {
  return (
    <Card aria-live="polite" data-testid="recording-plan-review">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        <div className="flex flex-wrap gap-3">
          <Button disabled={useDisabled} onClick={onUse}>
            Use this plan
          </Button>
          <Button variant="outline" onClick={onChooseAnother}>
            Choose another
          </Button>
          <Button variant="ghost" onClick={onRecordWithoutPlan}>
            Record without a plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
