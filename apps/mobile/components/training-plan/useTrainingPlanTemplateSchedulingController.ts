import React, { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";

type ScheduleAnchorMode = "start" | "finish";

interface UseTrainingPlanTemplateSchedulingControllerParams {
  handleOpenCalendar: () => void;
  planId?: string;
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  router: { navigate: (value: any) => void; replace: (value: any) => void };
  utils: ReturnType<typeof api.useUtils>;
}

export function useTrainingPlanTemplateSchedulingController({
  handleOpenCalendar,
  planId,
  queryClient,
  router,
  utils,
}: UseTrainingPlanTemplateSchedulingControllerParams) {
  const [scheduleAnchorMode, setScheduleAnchorMode] = useState<ScheduleAnchorMode>("start");
  const [templateAnchorDate, setTemplateAnchorDate] = useState("");
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showConcurrencyWarning, setShowConcurrencyWarning] = useState(false);

  const handleCloseScheduleFlow = useCallback(() => {
    setShowApplyModal(false);
    setShowConcurrencyWarning(false);
  }, []);

  const { data: rawActivePlan } = api.trainingPlans.getActivePlan.useQuery(
    undefined,
    scheduleAwareReadQueryOptions,
  );
  const activePlan = rawActivePlan as any;

  const handleOpenCurrentPlan = useCallback(() => {
    handleCloseScheduleFlow();

    if (typeof activePlan?.id === "string") {
      router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(activePlan.id) as any);
      return;
    }

    router.navigate(ROUTES.PLAN.INDEX as any);
  }, [activePlan?.id, handleCloseScheduleFlow, router]);

  const applyTemplateMutation = api.trainingPlans.applyTemplate.useMutation({
    onSuccess: (result) => {
      setShowApplyModal(false);
      setShowConcurrencyWarning(false);
      void refreshScheduleViews(queryClient, "trainingPlanSchedulingMutation");
      const successActions: Array<{ text: string; onPress: () => void }> = [];

      if (typeof result.applied_plan_id === "string") {
        successActions.push({
          text: "Open Scheduled Plan",
          onPress: () =>
            router.replace(ROUTES.PLAN.TRAINING_PLAN.DETAIL(result.applied_plan_id) as any),
        });
      }

      Alert.alert(
        "Plan scheduled",
        result.scheduled_sessions_replaced
          ? `Replaced your scheduled sessions and created ${result.scheduled_sessions_created} session${result.scheduled_sessions_created === 1 ? "" : "s"}.`
          : `Scheduled ${result.scheduled_sessions_created} session${result.scheduled_sessions_created === 1 ? "" : "s"}.`,
        successActions,
      );
    },
    onError: (error) => {
      if (
        error.message?.includes("active training plan") ||
        error.message?.includes("Replace them first")
      ) {
        Alert.alert(
          "Current plan already scheduled",
          "You already have scheduled sessions from a training plan. Open it to review, or replace the scheduled sessions from the plan detail screen.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Current Plan",
              onPress: handleOpenCurrentPlan,
            },
          ],
        );
        return;
      }

      Alert.alert("Schedule failed", error.message || "Could not schedule this training plan");
    },
  });

  const executeApplyTemplate = useCallback(
    (normalizedAnchorDate: string, anchorMode: ScheduleAnchorMode, replaceExisting: boolean) => {
      applyTemplateMutation.mutate({
        template_type: "training_plan",
        template_id: planId!,
        start_date:
          anchorMode === "start" && normalizedAnchorDate ? normalizedAnchorDate : undefined,
        target_date:
          anchorMode === "finish" && normalizedAnchorDate ? normalizedAnchorDate : undefined,
        replace_existing: replaceExisting || undefined,
      });
    },
    [applyTemplateMutation, planId],
  );

  const scheduleAnchorContent = useMemo(() => {
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
  }, [scheduleAnchorMode, templateAnchorDate]);

  const handleSelectScheduleAnchorMode = useCallback((mode: ScheduleAnchorMode) => {
    setScheduleAnchorMode(mode);
    setTemplateAnchorDate("");
  }, []);

  const handleApplyTemplate = useCallback(() => {
    if (!planId) {
      Alert.alert("Schedule failed", "No plan ID was found.");
      return;
    }

    const normalizedAnchorDate = templateAnchorDate.trim();

    if (scheduleAnchorMode === "finish" && !normalizedAnchorDate) {
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

    if (activePlan) {
      setShowApplyModal(false);
      setShowConcurrencyWarning(true);
    } else {
      executeApplyTemplate(normalizedAnchorDate, scheduleAnchorMode, false);
    }
  }, [
    activePlan,
    executeApplyTemplate,
    planId,
    scheduleAnchorContent.emptyDateMessage,
    scheduleAnchorContent.emptyDateTitle,
    scheduleAnchorContent.invalidDateTitle,
    scheduleAnchorMode,
    templateAnchorDate,
  ]);

  const handleReplaceScheduledPlan = useCallback(() => {
    const normalizedAnchorDate = templateAnchorDate.trim();
    setShowConcurrencyWarning(false);
    executeApplyTemplate(normalizedAnchorDate, scheduleAnchorMode, true);
  }, [executeApplyTemplate, scheduleAnchorMode, templateAnchorDate]);

  return {
    activePlan,
    applyTemplateMutation,
    handleApplyTemplate,
    handleOpenActivePlan: handleOpenCurrentPlan,
    handleCloseScheduleFlow,
    handleReplaceScheduledPlan,
    handleSelectScheduleAnchorMode,
    scheduleAnchorContent,
    scheduleAnchorMode,
    setShowApplyModal,
    setShowConcurrencyWarning,
    setTemplateAnchorDate,
    showApplyModal,
    showConcurrencyWarning,
    templateAnchorDate,
  };
}
