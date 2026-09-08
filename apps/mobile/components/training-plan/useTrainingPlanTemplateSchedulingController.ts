import { skipToken } from "@tanstack/react-query";
import type { ImperativeRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";

type ScheduleAnchorMode = "start" | "finish";
type ScheduleApplicationMode = "full" | "remaining";

interface UseTrainingPlanTemplateSchedulingControllerParams {
  handleOpenCalendar: () => void;
  planId?: string;
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  router: Pick<ImperativeRouter, "navigate" | "replace">;
  utils: ReturnType<typeof api.useUtils>;
}

export function useTrainingPlanTemplateSchedulingController({
  planId,
  queryClient,
  router,
  utils,
}: UseTrainingPlanTemplateSchedulingControllerParams) {
  const [scheduleAnchorMode, setScheduleAnchorMode] = useState<ScheduleAnchorMode>("start");
  const [scheduleApplicationMode, setScheduleApplicationMode] =
    useState<ScheduleApplicationMode>("full");
  const [templateAnchorDate, setTemplateAnchorDate] = useState("");
  const [showApplyModal, setShowApplyModal] = useState(false);

  const handleCloseScheduleFlow = useCallback(() => {
    setShowApplyModal(false);
  }, []);

  const { data: appliedSchedule } = api.trainingPlans.getAppliedSchedule.useQuery(
    planId ? { training_plan_id: planId } : skipToken,
    scheduleAwareReadQueryOptions,
  );

  const applyTemplateMutation = api.trainingPlans.applyTemplate.useMutation({
    onSuccess: (result) => {
      setShowApplyModal(false);
      void Promise.all([
        refreshScheduleViews(queryClient, "trainingPlanSchedulingMutation"),
        planId
          ? utils.trainingPlans.getAppliedSchedule.invalidate({ training_plan_id: planId })
          : Promise.resolve(),
      ]);
      const successActions: Array<{ text: string; onPress: () => void }> = [];

      if (typeof result.applied_plan_id === "string") {
        successActions.push({
          text: "Open Scheduled Plan",
          onPress: () => router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.applied_plan_id)),
        });
      }

      Alert.alert(
        "Plan scheduled",
        `Scheduled ${result.scheduled_sessions_created} session${result.scheduled_sessions_created === 1 ? "" : "s"}.`,
        successActions,
      );
    },
    onError: (error) => {
      Alert.alert("Schedule failed", error.message || "Could not schedule this training plan");
    },
  });

  const executeApplyTemplate = useCallback(
    (
      normalizedAnchorDate: string,
      anchorMode: ScheduleAnchorMode,
      applicationMode: ScheduleApplicationMode,
    ) => {
      if (!planId) {
        Alert.alert("Schedule failed", "This training plan is unavailable.");
        return;
      }
      applyTemplateMutation.mutate({
        application_mode: applicationMode,
        template_type: "training_plan",
        template_id: planId,
        start_date:
          anchorMode === "start" && normalizedAnchorDate && applicationMode === "full"
            ? normalizedAnchorDate
            : undefined,
        target_date:
          anchorMode === "finish" && normalizedAnchorDate ? normalizedAnchorDate : undefined,
      });
    },
    [applyTemplateMutation, planId],
  );

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

  const handleSelectScheduleApplicationMode = useCallback((mode: ScheduleApplicationMode) => {
    setScheduleApplicationMode(mode);
    setTemplateAnchorDate("");
    setScheduleAnchorMode(mode === "remaining" ? "finish" : "start");
  }, []);

  const handleSelectScheduleAnchorMode = useCallback(
    (mode: ScheduleAnchorMode) => {
      if (scheduleApplicationMode === "remaining") {
        setScheduleAnchorMode("finish");
        return;
      }

      setScheduleAnchorMode(mode);
      setTemplateAnchorDate("");
    },
    [scheduleApplicationMode],
  );

  const handleApplyTemplate = useCallback(() => {
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

    executeApplyTemplate(normalizedAnchorDate, scheduleAnchorMode, scheduleApplicationMode);
  }, [
    executeApplyTemplate,
    planId,
    scheduleAnchorContent.emptyDateMessage,
    scheduleAnchorContent.emptyDateTitle,
    scheduleAnchorContent.invalidDateTitle,
    scheduleApplicationMode,
    scheduleAnchorMode,
    templateAnchorDate,
  ]);

  return {
    appliedSchedule,
    applyTemplateMutation,
    handleApplyTemplate,
    handleCloseScheduleFlow,
    handleSelectScheduleApplicationMode,
    handleSelectScheduleAnchorMode,
    scheduleApplicationMode,
    scheduleAnchorContent,
    scheduleAnchorMode,
    setShowApplyModal,
    setTemplateAnchorDate,
    showApplyModal,
    templateAnchorDate,
  };
}
