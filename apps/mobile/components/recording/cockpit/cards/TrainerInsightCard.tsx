import { Text } from "@repo/ui/components/text";
import React from "react";
import { Pressable, View } from "react-native";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

export function TrainerInsightCard({
  mode,
  plan,
  readings,
  service,
  sessionContract,
}: InsightCardProps) {
  const sessionView = service?.getSessionView?.();
  const trainer = sessionView?.trainer;
  const trainerMode = sessionView?.overrideState.trainerMode ?? "auto";
  const controllable =
    (sessionContract?.devices.trainerControllable ?? false) ||
    trainer?.controlState === "controllable";
  const lastResistance =
    trainer?.lastCommandStatus?.commandType === "set_resistance"
      ? trainer.lastCommandStatus.targetValue
      : undefined;
  const [resistance, setResistance] = React.useState(lastResistance ?? 30);
  const targetLabel = getPlanTargetLabel(plan);
  const status = getTrainerStatus({ controllable, trainer });
  const manualControlEnabled = controllable && trainerMode === "manual";

  React.useEffect(() => {
    if (typeof lastResistance === "number") {
      setResistance(lastResistance);
    }
  }, [lastResistance]);

  const setMode = React.useCallback(
    (nextMode: "auto" | "manual") => {
      service?.setManualControlMode(nextMode === "manual");
    },
    [service],
  );

  const adjustResistance = React.useCallback(
    (delta: number) => {
      setResistance((current) => {
        const next = Math.max(0, Math.min(100, current + delta));

        if (manualControlEnabled) {
          service?.applyManualTrainerResistance(next).catch(console.error);
        }

        return next;
      });
    },
    [manualControlEnabled, service],
  );

  if (mode === "compact") {
    return (
      <View className="h-full justify-between gap-3" testID="trainer-insight-card">
        <View className="flex-1 flex-row items-stretch gap-2">
          <MetricTile
            compact
            label="Power"
            subtitle={trainerMode === "auto" ? targetLabel : null}
            value={readings.power ? `${Math.round(readings.power)} W` : "--"}
          />
          <MetricTile compact label="Mode" value={trainerMode === "manual" ? "Manual" : "Auto"} />
          <MetricTile compact label="Control" tone={status.tone} value={status.label} />
        </View>
        {trainerMode === "manual" ? (
          <ResistanceControls
            disabled={!manualControlEnabled}
            onDecrease={() => adjustResistance(-5)}
            onIncrease={() => adjustResistance(5)}
            resistance={resistance}
          />
        ) : (
          <Text className="text-xs font-medium text-muted-foreground" numberOfLines={2}>
            {controllable
              ? targetLabel
                ? `Auto control follows ${targetLabel}.`
                : "Auto control is ready for plan or route targets."
              : status.detail}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className="gap-5" testID="trainer-insight-card">
      <View className="flex-row gap-3">
        <MetricTile
          label="Power"
          subtitle={trainerMode === "auto" ? targetLabel : null}
          value={readings.power ? `${Math.round(readings.power)} W` : "--"}
        />
        <MetricTile
          label="Cadence"
          value={readings.cadence ? `${Math.round(readings.cadence)} rpm` : "--"}
        />
        <MetricTile label="Control" tone={status.tone} value={status.label} />
      </View>

      <View className="rounded-[32px] bg-muted/45 p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Trainer Control
        </Text>
        <Text className="mt-2 text-2xl font-black text-foreground">{status.label}</Text>
        <Text className="mt-2 text-base leading-6 text-muted-foreground">{status.detail}</Text>
      </View>

      {trainer?.lastCommandStatus?.success === false ? (
        <View className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Text className="text-xs font-semibold text-amber-700">
            Last command failed:{" "}
            {trainer.lastCommandStatus.errorMessage ?? trainer.lastCommandStatus.outcome}
          </Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <ModeChip
          active={trainerMode === "auto"}
          disabled={!controllable}
          label="Auto"
          onPress={() => setMode("auto")}
        />
        <ModeChip
          active={trainerMode === "manual"}
          disabled={!controllable}
          label="Manual"
          onPress={() => setMode("manual")}
        />
      </View>

      <View>
        <ResistanceControls
          disabled={!manualControlEnabled}
          onDecrease={() => adjustResistance(-5)}
          onIncrease={() => adjustResistance(5)}
          resistance={resistance}
        />
        {!manualControlEnabled ? (
          <Text className="mt-2 text-xs text-muted-foreground">
            Switch to manual mode before sending resistance commands.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function getPlanTargetLabel(plan: InsightCardProps["plan"]) {
  if (!plan.hasPlan) return null;
  const target = plan.currentStep?.targets?.find(
    (entry) => entry.type === "%FTP" || entry.type === "watts",
  );

  if (!target) return null;
  if (target.type === "%FTP") return `${Math.round(target.intensity)}% FTP`;
  if (target.type === "watts") return `${Math.round(target.intensity)} W`;
  return null;
}

function getTrainerStatus({
  controllable,
  trainer,
}: {
  controllable: boolean;
  trainer:
    | ReturnType<NonNullable<InsightCardProps["service"]>["getSessionView"]>["trainer"]
    | undefined;
}): { label: string; detail: string; tone: "neutral" | "good" | "warn" | "danger" } {
  if (trainer?.recoveryState === "applying_reconnect_recovery") {
    return {
      label: "Recovering",
      detail: "Trainer connection changed. The app is trying to restore control and targets.",
      tone: "warn",
    };
  }

  if (trainer?.lastCommandStatus?.success === false || trainer?.controlState === "failed") {
    return {
      label: "Check",
      detail: "Trainer control needs attention before commands are reliable.",
      tone: "danger",
    };
  }

  if (controllable) {
    return {
      label: "Ready",
      detail:
        "Trainer control is available. Auto mode follows workout or route targets; manual mode sends direct commands.",
      tone: "good",
    };
  }

  if (trainer?.dataFlowState === "flowing") {
    return {
      label: "Data only",
      detail: "Trainer data is flowing, but direct machine control is not ready.",
      tone: "warn",
    };
  }

  return {
    label: "Waiting",
    detail: "Connect a controllable trainer to unlock auto targets and manual resistance.",
    tone: "neutral",
  };
}

function ResistanceControls({
  disabled,
  onDecrease,
  onIncrease,
  resistance,
}: {
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  resistance: number;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <TrainerControlButton disabled={disabled} label="-" onPress={onDecrease} />
      <View className="flex-1 rounded-2xl bg-muted/60 px-3 py-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Resistance
        </Text>
        <Text className="mt-0.5 text-base font-bold text-foreground">{resistance}%</Text>
      </View>
      <TrainerControlButton disabled={disabled} label="+" onPress={onIncrease} />
    </View>
  );
}

function ModeChip({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      className={
        active
          ? "flex-1 rounded-full bg-foreground px-4 py-2 active:opacity-80"
          : "flex-1 rounded-full border border-border bg-background px-4 py-2 active:opacity-80"
      }
    >
      <Text
        className={
          active
            ? "text-center text-xs font-bold text-background"
            : "text-center text-xs font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TrainerControlButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        disabled
          ? "h-11 w-11 items-center justify-center rounded-full bg-muted"
          : "h-11 w-11 items-center justify-center rounded-full bg-foreground active:opacity-80"
      }
    >
      <Text
        className={
          disabled ? "text-lg font-bold text-muted-foreground" : "text-lg font-bold text-background"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
