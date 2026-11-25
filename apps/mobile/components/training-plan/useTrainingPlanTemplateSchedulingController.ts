import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { useReadOnlyPreview } from "@repo/ui/hooks";
import { skipToken } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { randomUUID } from "expo-crypto";
import type { ImperativeRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";

type ScheduleAnchorMode = "start" | "finish";
type ScheduleApplicationMode = "full" | "remaining";
type ApplicationRequest = inferRouterInputs<AppRouter>["trainingPlans"]["previewApplication"];
type ApplicationPreview = Extract<
  inferRouterOutputs<AppRouter>["trainingPlans"]["previewApplication"],
  { status: "available" }
>;

type ScheduleReview = {
  operationId: string;
  preview: ApplicationPreview;
  request: ApplicationRequest;
};

interface UseTrainingPlanTemplateSchedulingControllerParams {
  handleOpenCalendar: () => void;
  planId?: string;
  profileId?: string;
  sourceRevision?: string;
  routePlanId?: string;
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  router: Pick<ImperativeRouter, "navigate" | "replace">;
  utils: ReturnType<typeof api.useUtils>;
}

export function useTrainingPlanTemplateSchedulingController({
  planId,
  profileId,
  sourceRevision,
  routePlanId,
  queryClient,
  router,
  utils,
}: UseTrainingPlanTemplateSchedulingControllerParams) {
  const [scheduleAnchorMode, setScheduleAnchorMode] = useState<ScheduleAnchorMode>("start");
  const [scheduleApplicationMode, setScheduleApplicationMode] =
    useState<ScheduleApplicationMode>("full");
  const [templateAnchorDate, updateTemplateAnchorDate] = useState("");
  const [showApplyModal, setShowApplyModal] = useState(false);
  const appliedSchedulesQuery = api.trainingPlans.listAppliedSchedules.useQuery(
    planId ? { training_plan_id: planId } : skipToken,
    scheduleAwareReadQueryOptions,
  );
  const appliedSchedules = appliedSchedulesQuery.data;
  const [selectedApplicationId, updateSelectedApplicationId] = useState("");
  const selectedApplication = appliedSchedules?.items.find(
    (item) => item.application_id === selectedApplicationId,
  );

  const contextKey = JSON.stringify([profileId, routePlanId ?? planId, planId]);
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const preview = useReadOnlyPreview<ScheduleReview>(
    JSON.stringify([
      contextKey,
      sourceRevision,
      selectedApplicationId,
      appliedSchedules?.items,
      appliedSchedulesQuery.error?.message,
      scheduleAnchorMode,
      scheduleApplicationMode,
      templateAnchorDate,
    ]),
  );
  const [retained, setRetained] = useState<{ context: string; review: ScheduleReview } | null>(
    null,
  );
  const dispatched = useRef<{
    context: string;
    planId: string | undefined;
    review: ScheduleReview;
  } | null>(null);
  const mutationGuard = useRef(false);
  const [applyPending, setApplyPending] = useState(false);
  const [errorState, setErrorState] = useState<{ context: string; message: string | null } | null>(
    null,
  );
  const applyError = errorState?.context === contextKey ? errorState.message : null;
  const setApplyError = useCallback(
    (message: string | null) => setErrorState({ context: contextKey, message }),
    [contextKey],
  );
  const scheduleReview = retained?.context === contextKey ? retained.review : preview.data;
  const inputsLocked = applyPending || retained?.context === contextKey;
  const setTemplateAnchorDate = (value: string) => {
    if (inputsLocked) return;
    preview.clear();
    updateTemplateAnchorDate(value);
  };
  const setSelectedApplicationId = (value: string) => {
    if (inputsLocked) return;
    preview.clear();
    updateSelectedApplicationId(value);
  };
  const handleCloseScheduleFlow = () => {
    if (applyPending) return;
    setShowApplyModal(false);
    preview.clear();
  };

  const applyTemplateMutation = api.trainingPlans.applyApplication.useMutation({
    onSuccess: (result) => {
      mutationGuard.current = false;
      setApplyPending(false);
      if (dispatched.current && dispatched.current.context !== contextRef.current) return;
      setRetained(null);
      setApplyError(null);
      if (result.status === "stale") {
        preview.clear();
        setApplyError("The plan or schedule changed. Review again before confirming.");
        Alert.alert(
          "Schedule review expired",
          "The plan or schedule changed. Your date choices are still available; review again before confirming.",
        );
        return;
      }
      if (result.status === "operation_conflict") {
        preview.clear();
        setApplyError("Review the schedule again before confirming.");
        Alert.alert("Schedule review expired", "Review the schedule again before confirming.");
        return;
      }
      setShowApplyModal(false);
      preview.clear();
      void Promise.allSettled([
        refreshScheduleViews(queryClient, "trainingPlanSchedulingMutation"),
        planId
          ? utils.trainingPlans.listAppliedSchedules.invalidate({ training_plan_id: planId })
          : Promise.resolve(),
      ]);
      const successActions: Array<{ text: string; onPress: () => void }> = [];

      if (planId) {
        successActions.push({
          text: "Open Scheduled Plan",
          onPress: () => router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(planId)),
        });
      }

      Alert.alert(
        "Plan scheduled",
        `Scheduled ${result.created} session${result.created === 1 ? "" : "s"}.`,
        successActions,
      );
    },
    onError: (error) => {
      mutationGuard.current = false;
      setApplyPending(false);
      if (dispatched.current?.context !== contextRef.current) return;
      setApplyError(error.message || "Could not confirm scheduling. Retry the same request.");
      Alert.alert("Schedule failed", error.message || "Could not schedule this training plan");
    },
  });

  const reviewSchedule = useCallback(
    (
      normalizedAnchorDate: string,
      anchorMode: ScheduleAnchorMode,
      applicationMode: ScheduleApplicationMode,
    ) => {
      if (!planId) {
        Alert.alert("Schedule failed", "This training plan is unavailable.");
        return;
      }
      const application = {
        applicationMode,
        trainingPlanId: planId,
        startDate:
          anchorMode === "start" && normalizedAnchorDate && applicationMode === "full"
            ? normalizedAnchorDate
            : undefined,
        targetDate:
          anchorMode === "finish" && normalizedAnchorDate ? normalizedAnchorDate : undefined,
        ...(selectedApplication
          ? { replacesApplicationId: selectedApplication.application_id }
          : {}),
      };
      void preview.run(async () => {
        const result = await utils.trainingPlans.previewApplication.fetch(application);
        if (result.status !== "available") {
          if (result.reason === "plan_unavailable")
            throw new Error("This training plan is no longer available.");
          throw new Error("The plan changed before it could be reviewed. Try again.");
        }
        return { operationId: randomUUID(), preview: result, request: application };
      });
    },
    [planId, selectedApplication, utils.trainingPlans.previewApplication, preview],
  );

  const confirmSchedule = useCallback(() => {
    if (!scheduleReview || mutationGuard.current) return;
    mutationGuard.current = true;
    setApplyPending(true);
    setApplyError(null);
    setRetained({ context: contextKey, review: scheduleReview });
    dispatched.current = { context: contextKey, planId, review: scheduleReview };
    applyTemplateMutation.mutate({
      ...scheduleReview.request,
      operationId: scheduleReview.operationId,
      expectedPlanRevision: scheduleReview.preview.planRevision,
      expectedPlanHash: scheduleReview.preview.planHash,
      basePublishedRevision: scheduleReview.preview.basePublishedRevision,
      previewFingerprint: scheduleReview.preview.previewFingerprint,
    });
  }, [applyTemplateMutation, scheduleReview, contextKey, planId, setApplyError]);

  const scheduleAnchorContent = useMemo(() => {
    if (scheduleApplicationMode === "remaining") {
      return {
        fieldLabel: "Finish By",
        fieldPlaceholder: "Select finish date",
        helperText:
          templateAnchorDate.length > 0
            ? "We'll keep the target date and only schedule the remaining sessions that are still ahead of today."
            : "Choose the date the plan should finish. We'll skip elapsed sessions and keep the remaining work aligned to that target.",
        emptyDateTitle: "Choose a finish date",
        emptyDateMessage:
          "Pick the date you want this plan to finish so we can schedule only the remaining sessions.",
        invalidDateTitle: "Invalid finish date",
      };
    }

    if (scheduleAnchorMode === "finish") {
      return {
        fieldLabel: "Finish By",
        fieldPlaceholder: "Select finish date",
        helperText:
          templateAnchorDate.length > 0
            ? "We'll back-schedule the earlier sessions so the final session lands by this date."
            : "Choose the date your final session should land. We'll place the earlier sessions automatically.",
        emptyDateTitle: "Choose a finish date",
        emptyDateMessage: "Pick the date you want this plan to finish, or switch back to Start On.",
        invalidDateTitle: "Invalid finish date",
      };
    }

    return {
      fieldLabel: "Start On",
      fieldPlaceholder: "Select start date",
      helperText:
        templateAnchorDate.length > 0
          ? "Week 1 will begin on this date and the rest of the plan will follow from there."
          : "Leave blank to start from today, or pick the day you want week 1 to begin.",
      emptyDateTitle: null,
      emptyDateMessage: null,
      invalidDateTitle: "Invalid start date",
    };
  }, [scheduleAnchorMode, scheduleApplicationMode, templateAnchorDate]);

  const handleSelectScheduleApplicationMode = useCallback(
    (mode: ScheduleApplicationMode) => {
      if (inputsLocked) return;
      preview.clear();
      setScheduleApplicationMode(mode);
      updateTemplateAnchorDate("");
      setScheduleAnchorMode(mode === "remaining" ? "finish" : "start");
    },
    [inputsLocked, preview],
  );

  const handleSelectScheduleAnchorMode = useCallback(
    (mode: ScheduleAnchorMode) => {
      if (inputsLocked) return;
      preview.clear();
      if (scheduleApplicationMode === "remaining") {
        setScheduleAnchorMode("finish");
        return;
      }

      setScheduleAnchorMode(mode);
      updateTemplateAnchorDate("");
    },
    [scheduleApplicationMode, inputsLocked, preview],
  );

  const handleApplyTemplate = useCallback(() => {
    if (routePlanId && routePlanId !== planId) return;
    if (applyPending) return;
    if (
      !scheduleReview &&
      (appliedSchedulesQuery.isLoading ||
        appliedSchedulesQuery.error ||
        (selectedApplicationId && !selectedApplication))
    )
      return;
    if (!planId) {
      Alert.alert("Schedule failed", "No plan ID was found.");
      return;
    }

    const normalizedAnchorDate = templateAnchorDate.trim();

    if (
      (scheduleAnchorMode === "finish" || scheduleApplicationMode === "remaining") &&
      !normalizedAnchorDate
    ) {
      Alert.alert(
        scheduleAnchorContent.emptyDateTitle ?? "Choose a finish date",
        scheduleAnchorContent.emptyDateMessage ?? "Pick the date you want this plan to finish.",
      );
      return;
    }

    if (normalizedAnchorDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedAnchorDate)) {
      Alert.alert(scheduleAnchorContent.invalidDateTitle, "Use YYYY-MM-DD format.");
      return;
    }

    if (scheduleReview) {
      confirmSchedule();
      return;
    }

    reviewSchedule(normalizedAnchorDate, scheduleAnchorMode, scheduleApplicationMode);
  }, [
    confirmSchedule,
    planId,
    scheduleAnchorContent.emptyDateMessage,
    scheduleAnchorContent.emptyDateTitle,
    scheduleAnchorContent.invalidDateTitle,
    scheduleApplicationMode,
    scheduleAnchorMode,
    scheduleReview,
    templateAnchorDate,
    reviewSchedule,
    applyPending,
    appliedSchedulesQuery.isLoading,
    appliedSchedulesQuery.error,
    selectedApplicationId,
    selectedApplication,
    routePlanId,
  ]);

  return {
    appliedSchedules,
    appliedSchedulesQuery,
    applyPending,
    inputsLocked,
    previewPending: preview.isPending,
    scheduleError: applyError ?? preview.error,
    applyTemplateMutation,
    handleApplyTemplate,
    handleCloseScheduleFlow,
    handleSelectScheduleApplicationMode,
    handleSelectScheduleAnchorMode,
    scheduleApplicationMode,
    scheduleAnchorContent,
    scheduleAnchorMode,
    scheduleReview,
    selectedApplication,
    selectedApplicationId,
    setSelectedApplicationId,
    setShowApplyModal,
    setTemplateAnchorDate,
    showApplyModal,
    templateAnchorDate,
  };
}
