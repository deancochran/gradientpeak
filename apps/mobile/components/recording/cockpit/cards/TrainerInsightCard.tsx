import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Gauge, Minus, Plus, RotateCcw, SlidersHorizontal, Zap } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
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
  const autoTarget = React.useMemo(
    () => buildAutoTargetSummary(plan, descriptorState, trainer),
    [descriptorState, plan, trainer],
  );
  const manualControlEnabled = controllable && trainerMode === "manual";
  const remoteModes = React.useMemo(
    () => buildRemoteModes(descriptorState.availableModes),
    [descriptorState.availableModes],
  );
  const [remoteModeId, setRemoteModeId] = React.useState<RemoteModeId>(() =>
    getInitialRemoteModeId(descriptorState.modeId, remoteModes),
  );
  const activeRemoteMode = remoteModes.find((entry) => entry.id === remoteModeId) ?? remoteModes[0];
  const [remoteTargets, setRemoteTargets] = React.useState<Record<RemoteModeId, number>>(() =>
    buildInitialRemoteTargets(remoteModes, resistance),
  );

  React.useEffect(() => {
    if (typeof lastResistance === "number") {
      setResistance(lastResistance);
    }
  }, [lastResistance]);

  React.useEffect(() => {
    setRemoteModeId((current) =>
      remoteModes.some((mode) => mode.id === current)
        ? current
        : getInitialRemoteModeId(descriptorState.modeId, remoteModes),
    );
    setRemoteTargets((current) => ({
      ...buildInitialRemoteTargets(remoteModes, resistance),
      ...current,
    }));
  }, [descriptorState.modeId, remoteModes, resistance]);

  const setMode = React.useCallback(
    (nextMode: "auto" | "manual") => {
      service?.setManualControlMode(nextMode === "manual");
    },
    [service],
  );

  const adjustRemoteTarget = React.useCallback(
    (delta: number) => {
      if (!activeRemoteMode) return;

      setRemoteTargets((current) => {
        const previous = current[activeRemoteMode.id] ?? activeRemoteMode.defaultValue;
        const next = clampToMode(previous + delta, activeRemoteMode);

        if (manualControlEnabled) {
          applyRemoteTarget(service, activeRemoteMode.id, next);
        }

        if (activeRemoteMode.id === "resistance") {
          setResistance(next);
        }

        return { ...current, [activeRemoteMode.id]: next };
      });
    },
    [activeRemoteMode, manualControlEnabled, service],
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
        <CompactModeHeader
          mode={trainerMode}
          status={status.label}
          targetTitle={autoTarget.title}
        />
        {trainerMode === "auto" ? (
          <CompactAutoTargetSummary summary={autoTarget} />
        ) : (
          <CompactRemoteSummary
            disabled={!manualControlEnabled}
            mode={activeRemoteMode}
            onDecrease={() => adjustRemoteTarget(-(activeRemoteMode?.step ?? 5))}
            onIncrease={() => adjustRemoteTarget(activeRemoteMode?.step ?? 5)}
            status={status.detail}
            target={activeRemoteMode ? remoteTargets[activeRemoteMode.id] : resistance}
          />
        )}
      </View>
    );
  }

  return (
    <View className="gap-5" testID="trainer-insight-card">
      <TrainerControlHeader mode={trainerMode} status={status} summary={autoTarget} />

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

      {trainerMode === "auto" ? (
        <AutoTargetPanel
          readings={readings}
          status={status}
          summary={autoTarget}
          trainerModeId={descriptorState.modeId}
        />
      ) : (
        <TrainerRemoteControl
          disabled={!manualControlEnabled || !activeRemoteMode}
          mode={activeRemoteMode}
          modes={remoteModes}
          onDecrease={() => adjustRemoteTarget(-(activeRemoteMode?.step ?? 5))}
          onIncrease={() => adjustRemoteTarget(activeRemoteMode?.step ?? 5)}
          onModeChange={setRemoteModeId}
          target={activeRemoteMode ? remoteTargets[activeRemoteMode.id] : resistance}
        />
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
  range?: { min?: number; max?: number; increment?: number; unit?: string | null };
}

interface DescriptorTarget {
  label?: string | null;
  value?: number | string | null;
  unit?: string | null;
}

interface AutoTargetMetric {
  label: string;
  value: string;
}

interface AutoTargetSummary {
  detail: string;
  metrics: AutoTargetMetric[];
  subtitle: string;
  title: string;
}

function buildAutoTargetSummary(
  plan: InsightCardProps["plan"],
  descriptorState: ReturnType<typeof getDescriptorState>,
  trainer:
    | ReturnType<NonNullable<InsightCardProps["service"]>["getSessionView"]>["trainer"]
    | undefined,
): AutoTargetSummary {
  const currentStep = plan.hasPlan ? plan.currentStep : undefined;
  const planMetrics =
    currentStep?.targets?.map(formatPlanTargetMetric).filter(isTargetMetric) ?? [];
  const descriptorMetric = descriptorState.targetDetail
    ? [{ label: "Active Target", value: descriptorState.targetDetail }]
    : [];
  const commandMetric = getCommandTargetLabel(trainer)
    ? [{ label: "Last Command", value: getCommandTargetLabel(trainer) as string }]
    : [];
  const metrics =
    planMetrics.length > 0
      ? planMetrics
      : descriptorMetric.length > 0
        ? descriptorMetric
        : commandMetric;

  if (currentStep) {
    return {
      title: currentStep.name ?? "Current interval",
      subtitle: plan.name ?? "Activity target",
      detail: "Auto mode follows this step and updates the trainer when the target changes.",
      metrics: metrics.length > 0 ? metrics : [{ label: "Target", value: "Follow step" }],
    };
  }

  if (descriptorState.targetDetail) {
    return {
      title: "Active trainer target",
      subtitle: descriptorState.modeLabel,
      detail: "Auto mode is holding the active trainer target from the session descriptor.",
      metrics,
    };
  }

  return {
    title: "Waiting for target",
    subtitle: "Auto mode",
    detail: "Attach a structured activity or route to send automatic trainer targets.",
    metrics: [{ label: "Target", value: "None" }],
  };
}

function formatPlanTargetMetric(target: unknown): AutoTargetMetric | null {
  if (!target || typeof target !== "object") return null;
  const entry = target as { type?: string; intensity?: number; min?: number; max?: number };
  const type = entry.type;
  if (!type) return null;

  const value = formatTargetValue(entry);
  if (!value) return null;

  return { label: formatTargetLabel(type), value };
}

function isTargetMetric(metric: AutoTargetMetric | null): metric is AutoTargetMetric {
  return Boolean(metric);
}

function formatTargetLabel(type: string) {
  switch (type) {
    case "%FTP":
      return "Power";
    case "watts":
      return "Power";
    case "%THR":
      return "Heart Rate";
    case "%TPace":
      return "Pace";
    case "rpm":
      return "Cadence";
    default:
      return type.replace(/_/g, " ");
  }
}

function formatTargetValue(target: {
  type?: string;
  intensity?: number;
  min?: number;
  max?: number;
}) {
  const unit = getTargetUnit(target.type);
  if (typeof target.intensity === "number") {
    return `${Math.round(target.intensity)}${unit}`;
  }

  if (typeof target.min === "number" && typeof target.max === "number") {
    return `${Math.round(target.min)}-${Math.round(target.max)}${unit}`;
  }

  return null;
}

function getTargetUnit(type?: string) {
  switch (type) {
    case "%FTP":
    case "%THR":
    case "%TPace":
      return "%";
    case "watts":
      return " W";
    case "rpm":
      return " rpm";
    default:
      return "";
  }
}

type RemoteModeId = "erg" | "resistance" | "grade" | "speed" | "inclination" | "cadence";

interface RemoteMode {
  id: RemoteModeId;
  label: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  icon: typeof Zap;
}

const fallbackRemoteModes: RemoteMode[] = [
  {
    id: "resistance",
    label: "Resistance",
    unit: "%",
    defaultValue: 30,
    min: 0,
    max: 100,
    step: 5,
    icon: SlidersHorizontal,
  },
];

function buildRemoteModes(descriptorModes: DescriptorMode[]): RemoteMode[] {
  const modes = descriptorModes
    .filter((mode) => mode.enabled !== false)
    .map(mapDescriptorModeToRemoteMode)
    .filter((mode): mode is RemoteMode => Boolean(mode));

  return descriptorModes.length > 0 ? modes : fallbackRemoteModes;
}

function mapDescriptorModeToRemoteMode(mode: DescriptorMode): RemoteMode | null {
  const range = mode.range;

  switch (mode.id) {
    case "erg":
      return {
        id: "erg",
        label: "Power",
        unit: mode.range?.unit ?? "W",
        defaultValue: 180,
        min: range?.min ?? 0,
        max: range?.max ?? 800,
        step: range?.increment ?? 5,
        icon: Zap,
      };
    case "resistance":
      return {
        id: "resistance",
        label: "Resistance",
        unit: mode.range?.unit ?? "%",
        defaultValue: 30,
        min: range?.min ?? 0,
        max: range?.max ?? 100,
        step: range?.increment ?? 5,
        icon: SlidersHorizontal,
      };
    case "grade":
      return {
        id: "grade",
        label: "Grade",
        unit: "%",
        defaultValue: 0,
        min: -15,
        max: 20,
        step: 0.5,
        icon: Gauge,
      };
    case "speed":
      return {
        id: "speed",
        label: "Speed",
        unit: mode.range?.unit ?? "kph",
        defaultValue: 10,
        min: range?.min ?? 0,
        max: range?.max ?? 30,
        step: range?.increment ?? 0.5,
        icon: Gauge,
      };
    case "inclination":
      return {
        id: "inclination",
        label: "Incline",
        unit: mode.range?.unit ?? "%",
        defaultValue: 0,
        min: range?.min ?? -5,
        max: range?.max ?? 20,
        step: range?.increment ?? 0.5,
        icon: Gauge,
      };
    case "target_cadence":
      return {
        id: "cadence",
        label: "Cadence",
        unit: "rpm",
        defaultValue: 85,
        min: 40,
        max: 130,
        step: 5,
        icon: RotateCcw,
      };
    default:
      return null;
  }
}

function getInitialRemoteModeId(modeId: string | null, modes: RemoteMode[]): RemoteModeId {
  const mappedModeId = modeId === "target_cadence" ? "cadence" : modeId;
  return modes.find((mode) => mode.id === mappedModeId)?.id ?? modes[0]?.id ?? "resistance";
}

function buildInitialRemoteTargets(modes: RemoteMode[], resistance: number) {
  return Object.fromEntries(
    modes.map((mode) => [mode.id, mode.id === "resistance" ? resistance : mode.defaultValue]),
  ) as Record<RemoteModeId, number>;
}

function clampToMode(value: number, mode: RemoteMode) {
  return Math.max(mode.min, Math.min(mode.max, Number(value.toFixed(1))));
}

function applyRemoteTarget(
  service: InsightCardProps["service"],
  modeId: RemoteModeId,
  target: number,
) {
  switch (modeId) {
    case "erg":
      service?.applyManualTrainerPower(Math.round(target)).catch(console.error);
      break;
    case "resistance":
      service?.applyManualTrainerResistance(target).catch(console.error);
      break;
    case "grade":
      service
        ?.applyManualTrainerSimulation({ gradePercent: target, windSpeedMps: 0 })
        .catch(console.error);
      break;
    case "speed":
      service?.applyManualTrainerSpeed(target).catch(console.error);
      break;
    case "inclination":
      service?.applyManualTrainerIncline(target).catch(console.error);
      break;
    case "cadence":
      service?.applyManualTrainerCadence(Math.round(target)).catch(console.error);
      break;
  }
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
        "Trainer control is available. Auto mode follows activity or route targets; manual mode sends direct commands.",
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

function CompactModeHeader({
  mode,
  status,
  targetTitle,
}: {
  mode: "auto" | "manual";
  status: string;
  targetTitle: string;
}) {
  return (
    <View>
      <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {mode === "auto" ? "Auto Target" : "Manual Remote"}
      </Text>
      <Text className="mt-1 text-base font-black text-foreground" numberOfLines={1}>
        {mode === "auto" ? targetTitle : status}
      </Text>
    </View>
  );
}

function TrainerControlHeader({
  mode,
  status,
  summary,
}: {
  mode: "auto" | "manual";
  status: ReturnType<typeof getTrainerStatus>;
  summary: AutoTargetSummary;
}) {
  return (
    <View>
      <Text className="text-2xl font-black text-foreground">Trainer Control</Text>
      <Text className="mt-1 text-sm leading-5 text-muted-foreground">
        {mode === "auto" ? summary.detail : status.detail}
      </Text>
    </View>
  );
}

function CompactAutoTargetSummary({ summary }: { summary: AutoTargetSummary }) {
  const primaryMetric = summary.metrics[0];

  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 rounded-2xl bg-muted/60 px-3 py-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {primaryMetric?.label ?? summary.subtitle}
        </Text>
        <Text className="mt-0.5 text-base font-bold text-foreground" numberOfLines={1}>
          {primaryMetric?.value ?? summary.title}
        </Text>
      </View>
      {summary.metrics.slice(1, 2).map((metric) => (
        <View key={`${metric.label}-${metric.value}`} className="rounded-2xl bg-muted/60 px-3 py-2">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {metric.label}
          </Text>
          <Text className="mt-0.5 text-base font-bold text-foreground">{metric.value}</Text>
        </View>
      ))}
    </View>
  );
}

function AutoTargetPanel({
  readings,
  status,
  summary,
  trainerModeId,
}: {
  readings: InsightCardProps["readings"];
  status: ReturnType<typeof getTrainerStatus>;
  summary: AutoTargetSummary;
  trainerModeId: string | null;
}) {
  const showLiveContext = trainerModeId !== "erg";

  return (
    <View className="gap-4">
      <View className="rounded-[32px] border border-border bg-card p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {summary.subtitle}
        </Text>
        <Text className="mt-2 text-2xl font-black text-foreground">{summary.title}</Text>
        <View className="mt-4 flex-row flex-wrap gap-3">
          {summary.metrics.map((metric) => (
            <TargetMetricPill key={`${metric.label}-${metric.value}`} metric={metric} />
          ))}
        </View>
      </View>

      {showLiveContext ? (
        <View className="flex-row gap-3">
          <LiveTrainerMetric label="Live Power" value={formatOptionalMetric(readings.power, "W")} />
          <LiveTrainerMetric label="Control" value={status.label} />
        </View>
      ) : null}
    </View>
  );
}

function TargetMetricPill({ metric }: { metric: AutoTargetMetric }) {
  return (
    <View className="min-w-24 rounded-2xl bg-background px-3 py-2">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {metric.label}
      </Text>
      <Text className="mt-1 text-lg font-black text-foreground">{metric.value}</Text>
    </View>
  );
}

function LiveTrainerMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-muted/50 px-3 py-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 text-base font-bold text-foreground">{value}</Text>
    </View>
  );
}

function formatOptionalMetric(value: number | undefined, unit: string) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} ${unit}`
    : "--";
}

function CompactRemoteSummary({
  disabled,
  mode,
  onDecrease,
  onIncrease,
  status,
  target,
}: {
  disabled: boolean;
  mode: RemoteMode | undefined;
  onDecrease: () => void;
  onIncrease: () => void;
  status: string;
  target: number | undefined;
}) {
  if (!mode) {
    return (
      <Text className="text-xs font-medium text-muted-foreground" numberOfLines={2}>
        {status}
      </Text>
    );
  }

  return (
    <View className="flex-row items-center gap-2">
      <TrainerControlButton disabled={disabled} icon="minus" label="-" onPress={onDecrease} />
      <View className="flex-1 rounded-2xl bg-muted/60 px-3 py-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {mode.label}
        </Text>
        <Text className="mt-0.5 text-base font-bold text-foreground">
          {formatRemoteTarget(target ?? mode.defaultValue, mode)}
        </Text>
      </View>
      <TrainerControlButton disabled={disabled} icon="plus" label="+" onPress={onIncrease} />
    </View>
  );
}

function TrainerRemoteControl({
  disabled,
  mode,
  modes,
  onDecrease,
  onIncrease,
  onModeChange,
  target,
}: {
  disabled: boolean;
  mode: RemoteMode | undefined;
  modes: RemoteMode[];
  onDecrease: () => void;
  onIncrease: () => void;
  onModeChange: (modeId: RemoteModeId) => void;
  target: number | undefined;
}) {
  if (!mode || modes.length === 0) {
    return (
      <View className="rounded-[32px] border border-border bg-card p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Manual Control
        </Text>
        <Text className="mt-2 text-xl font-black text-foreground">No direct controls</Text>
        <Text className="mt-2 text-sm leading-5 text-muted-foreground">
          This trainer is connected for data, but it does not expose manual targets that match its
          machine type.
        </Text>
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-[32px] border border-border bg-background">
      <View className="bg-card px-5 py-4">
        <View className="flex-row items-center justify-between gap-3">
          <View>
            <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Remote
            </Text>
            <Text className="mt-1 text-lg font-black text-foreground">
              {mode ? mode.label : "Trainer"}
            </Text>
          </View>
          {mode ? (
            <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <Icon as={mode.icon} size={22} className="text-primary" />
            </View>
          ) : null}
        </View>

        <View className="mt-5 flex-row items-center justify-between gap-4">
          <TrainerControlButton disabled={disabled} icon="minus" label="-" onPress={onDecrease} />
          <View className="flex-1 items-center">
            <Text className="text-5xl font-black text-foreground">
              {mode ? formatRemoteTargetValue(target ?? mode.defaultValue, mode) : "--"}
            </Text>
            <Text className="mt-1 text-sm font-bold text-muted-foreground">
              {mode?.unit ?? "target"}
            </Text>
          </View>
          <TrainerControlButton disabled={disabled} icon="plus" label="+" onPress={onIncrease} />
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2 p-3">
        {modes.map((entry) => (
          <RemoteModeButton
            key={entry.id}
            active={mode?.id === entry.id}
            mode={entry}
            onPress={() => onModeChange(entry.id)}
          />
        ))}
      </View>
    </View>
  );
}

function RemoteModeButton({
  active,
  mode,
  onPress,
}: {
  active: boolean;
  mode: RemoteMode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={
        active
          ? "flex-row items-center gap-2 rounded-full bg-foreground px-3 py-2 active:opacity-80"
          : "flex-row items-center gap-2 rounded-full border border-border bg-card px-3 py-2 active:opacity-80"
      }
      onPress={onPress}
    >
      <Icon as={mode.icon} size={14} className={active ? "text-background" : "text-foreground"} />
      <Text
        className={
          active ? "text-xs font-bold text-background" : "text-xs font-bold text-foreground"
        }
      >
        {mode.label}
      </Text>
    </Pressable>
  );
}

function formatRemoteTarget(target: number, mode: RemoteMode) {
  return `${formatRemoteTargetValue(target, mode)} ${mode.unit}`;
}

function formatRemoteTargetValue(target: number, mode: RemoteMode) {
  if (mode.step < 1) {
    return target.toFixed(1);
  }

  return `${Math.round(target)}`;
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
  icon,
  label,
  onPress,
}: {
  disabled: boolean;
  icon?: "minus" | "plus";
  label: string;
  onPress: () => void;
}) {
  const IconComponent = icon === "minus" ? Minus : icon === "plus" ? Plus : null;

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
      {IconComponent ? (
        <Icon
          as={IconComponent}
          size={20}
          className={disabled ? "text-muted-foreground" : "text-background"}
        />
      ) : (
        <Text
          className={
            disabled
              ? "text-lg font-bold text-muted-foreground"
              : "text-lg font-bold text-background"
          }
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
