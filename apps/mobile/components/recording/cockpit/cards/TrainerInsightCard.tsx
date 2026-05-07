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
  const descriptorState = getDescriptorState(trainer, trainerMode, targetLabel);
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

  const selectTrainer = React.useCallback(
    (deviceId: string) => {
      service?.selectFTMSControlTarget?.(deviceId);
    },
    [service],
  );

  if (mode === "compact") {
    return (
      <View className="h-full justify-between gap-3" testID="trainer-insight-card">
        <View className="flex-1 flex-row items-stretch gap-2">
          <MetricTile
            compact
            label="Power"
            subtitle={descriptorState.targetDetail}
            value={readings.power ? `${Math.round(readings.power)} W` : "--"}
          />
          <MetricTile compact label="Mode" value={descriptorState.modeLabel} />
          <MetricTile compact label="Control" tone={status.tone} value={status.label} />
        </View>
        {descriptorState.hasDescriptors ? (
          <DescriptorModeSummary
            modes={descriptorState.availableModes}
            selectedMode={descriptorState.modeId}
          />
        ) : trainerMode === "manual" ? (
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
          subtitle={descriptorState.targetDetail}
          value={readings.power ? `${Math.round(readings.power)} W` : "--"}
        />
        <MetricTile label="Mode" value={descriptorState.modeLabel} />
        <MetricTile label="Control" tone={status.tone} value={status.label} />
      </View>

      <View className="rounded-[32px] bg-muted/45 p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Trainer Control
        </Text>
        <Text className="mt-2 text-2xl font-black text-foreground">{status.label}</Text>
        <Text className="mt-2 text-base leading-6 text-muted-foreground">{status.detail}</Text>
        {descriptorState.targetDetail ? (
          <Text className="mt-3 text-sm font-semibold text-foreground">
            Target: {descriptorState.targetDetail}
          </Text>
        ) : null}
      </View>

      {descriptorState.candidates.length > 1 ? (
        <View className="gap-3">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Trainer
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {descriptorState.candidates.map((candidate) => (
              <TrainerCandidateChip
                key={candidate.deviceId}
                active={candidate.deviceId === descriptorState.selectedDeviceId}
                disabled={!candidate.supportsControl}
                label={candidate.displayName}
                onPress={() => selectTrainer(candidate.deviceId)}
              />
            ))}
          </View>
        </View>
      ) : null}

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

      {descriptorState.hasDescriptors ? (
        <View className="gap-3">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Available FTMS modes
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {descriptorState.availableModes.map((mode) => (
              <DescriptorModeChip
                key={mode.id}
                mode={mode}
                selected={mode.id === descriptorState.modeId}
              />
            ))}
          </View>
          <Text className="text-xs text-muted-foreground">
            Mode controls come from the trainer session descriptor. Manual command inputs stay
            hidden until the descriptor exposes safe intent actions.
          </Text>
        </View>
      ) : (
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
      )}
    </View>
  );
}

type DescriptorTrainerView = NonNullable<
  ReturnType<NonNullable<InsightCardProps["service"]>["getSessionView"]>["trainer"]
> & {
  availableModes?: DescriptorMode[];
  selectedMode?: DescriptorModeId | DescriptorMode | null;
  selectedTarget?: DescriptorTarget | null;
  currentTarget?: DescriptorTarget | null;
  target?: DescriptorTarget | null;
  statusLabel?: string | null;
  selectedDeviceId?: string | null;
  candidates?: Array<{ deviceId: string; displayName: string; supportsControl: boolean }>;
};

type DescriptorModeId = string;

interface DescriptorMode {
  id: DescriptorModeId;
  label?: string;
  enabled?: boolean;
  disabledReason?: string;
  range?: { unit?: string | null };
}

interface DescriptorTarget {
  label?: string | null;
  value?: number | string | null;
  unit?: string | null;
}

function getDescriptorState(
  trainer:
    | ReturnType<NonNullable<InsightCardProps["service"]>["getSessionView"]>["trainer"]
    | undefined,
  trainerMode: "auto" | "manual",
  planTargetLabel: string | null,
) {
  const descriptorTrainer = trainer as DescriptorTrainerView | undefined;
  const availableModes = Array.isArray(descriptorTrainer?.availableModes)
    ? descriptorTrainer.availableModes.filter(isDescriptorMode)
    : [];
  const selectedMode = descriptorTrainer?.selectedMode as unknown;
  const modeId =
    typeof selectedMode === "string"
      ? selectedMode
      : isDescriptorMode(selectedMode)
        ? selectedMode.id
        : (descriptorTrainer?.currentControlMode ?? null);
  const modeLabel =
    isDescriptorMode(selectedMode) && selectedMode.label
      ? selectedMode.label
      : getModeLabel(modeId, trainer?.lastCommandStatus?.commandType, trainerMode);
  const target =
    descriptorTrainer?.selectedTarget ??
    descriptorTrainer?.currentTarget ??
    descriptorTrainer?.target;
  const targetDetail =
    formatDescriptorTarget(target) ?? getCommandTargetLabel(trainer) ?? planTargetLabel;
  const candidates = Array.isArray(descriptorTrainer?.candidates)
    ? descriptorTrainer.candidates
    : [];

  return {
    availableModes,
    candidates,
    hasDescriptors: availableModes.length > 0,
    modeId,
    modeLabel,
    selectedDeviceId: descriptorTrainer?.selectedDeviceId ?? trainer?.deviceId ?? null,
    targetDetail,
  };
}

function isDescriptorMode(mode: unknown): mode is DescriptorMode {
  if (!mode || typeof mode !== "object") return false;
  return typeof (mode as DescriptorMode).id === "string";
}

function formatDescriptorTarget(target: DescriptorTarget | null | undefined) {
  if (!target || target.value === undefined || target.value === null) return null;
  const label = target.label ? `${target.label} ` : "";
  const unit = target.unit ? ` ${target.unit}` : "";
  return `${label}${target.value}${unit}`;
}

function getCommandTargetLabel(
  trainer:
    | ReturnType<NonNullable<InsightCardProps["service"]>["getSessionView"]>["trainer"]
    | undefined,
) {
  const command = trainer?.lastCommandStatus;
  if (typeof command?.targetValue !== "number") return null;

  switch (command.commandType) {
    case "set_power":
      return `${Math.round(command.targetValue)} W`;
    case "set_resistance":
      return `${Math.round(command.targetValue)}% resistance`;
    case "set_speed":
      return `${command.targetValue.toFixed(1)} kph`;
    case "set_incline":
    case "set_simulation":
      return `${command.targetValue.toFixed(1)}% grade`;
    case "set_heart_rate":
      return `${Math.round(command.targetValue)} bpm`;
    case "set_cadence":
      return `${Math.round(command.targetValue)} rpm`;
    default:
      return null;
  }
}

function getModeLabel(
  modeId: string | null,
  commandType?: string,
  fallbackMode?: "auto" | "manual",
) {
  if (modeId) {
    return modeId
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  switch (commandType) {
    case "set_power":
      return "Target Power";
    case "set_resistance":
      return "Resistance";
    case "set_simulation":
      return "Grade";
    case "set_speed":
      return "Speed";
    case "set_incline":
      return "Incline";
    case "set_heart_rate":
      return "Heart Rate";
    case "set_cadence":
      return "Cadence";
    default:
      return fallbackMode === "manual" ? "Manual" : "Auto";
  }
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
}): {
  label: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
} {
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

function DescriptorModeSummary({
  modes,
  selectedMode,
}: {
  modes: DescriptorMode[];
  selectedMode: string | null;
}) {
  const selected = modes.find((mode) => mode.id === selectedMode);
  const enabledCount = modes.filter((mode) => mode.enabled !== false).length;

  return (
    <Text className="text-xs font-medium text-muted-foreground" numberOfLines={2}>
      {selected?.label ?? getModeLabel(selectedMode)} selected. {enabledCount} FTMS mode
      {enabledCount === 1 ? "" : "s"} available from session descriptors.
    </Text>
  );
}

function DescriptorModeChip({ mode, selected }: { mode: DescriptorMode; selected: boolean }) {
  const enabled = mode.enabled !== false;
  const label = mode.label ?? getModeLabel(mode.id);

  return (
    <View
      className={
        selected
          ? "rounded-full bg-foreground px-3 py-2"
          : enabled
            ? "rounded-full border border-border bg-background px-3 py-2"
            : "rounded-full bg-muted px-3 py-2"
      }
    >
      <Text
        className={
          selected
            ? "text-xs font-bold text-background"
            : enabled
              ? "text-xs font-bold text-foreground"
              : "text-xs font-bold text-muted-foreground"
        }
      >
        {label}
      </Text>
      {!enabled && mode.disabledReason ? (
        <Text className="mt-0.5 text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
          {mode.disabledReason}
        </Text>
      ) : null}
    </View>
  );
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

function TrainerCandidateChip({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
      className={`rounded-full border px-3 py-2 ${
        active ? "border-primary bg-primary/15" : "border-border bg-background"
      } ${disabled ? "opacity-50" : ""}`}
      disabled={disabled || active}
      onPress={onPress}
    >
      <Text
        className={`text-xs font-semibold ${active ? "text-primary" : "text-foreground"}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
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
