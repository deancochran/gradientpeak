import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import {
  buildManualActivityImportProvenance,
  type CanonicalSport,
  deriveActivityNameFromFileName,
  getSupportedActivityFileExtension,
  type ManualActivityImportOutput,
  manualActivityImportFormSchema,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Form,
  FormFileField,
  FormSegmentedSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { History } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { ActivityFileUploader } from "@/lib/services/fit/ActivityFileUploader";

const ACTIVITY_TYPES = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Ride" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
] as const satisfies readonly { value: CanonicalSport; label: string }[];

const ACTIVITY_FILE_MIME_TYPES = [
  "application/vnd.ant.fit",
  "application/gpx+xml",
  "application/vnd.garmin.tcx+xml",
  "application/xml",
  "text/xml",
  "application/octet-stream",
] as const;

type ImportPhase = "idle" | "signing" | "uploading" | "processing";

const IMPORT_PHASE_COPY: Record<Exclude<ImportPhase, "idle">, string> = {
  signing: "Step 1 of 3: Preparing upload…",
  uploading: "Step 2 of 3: Uploading activity file…",
  processing: "Step 3 of 3: Processing activity…",
};

function isActivityParseFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to parse fit file") ||
    normalized.includes("failed to parse activity file") ||
    normalized.includes("fit decode") ||
    normalized.includes("fit parser") ||
    normalized.includes("fit parse") ||
    normalized.includes("invalid gpx") ||
    normalized.includes("invalid tcx") ||
    normalized.includes("corrupt fit") ||
    normalized.includes("invalid fit") ||
    normalized.includes("bar error")
  );
}

const createOption = (value: string, label?: string) => ({
  value,
  label: label || value,
});

export default function ActivityImportScreen() {
  const navigateTo = useAppNavigate();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const [importError, setImportError] = useState<string | null>(null);
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    activityId: string;
    name: string;
    fileName: string;
  } | null>(null);

  const getSignedUrlMutation = api.activityFiles.getSignedUploadUrl.useMutation();
  const processActivityFileMutation = api.activityFiles.processActivityFile.useMutation();
  const form = useZodForm({
    schema: manualActivityImportFormSchema,
    defaultValues: {
      files: [],
      sport: "bike",
      name: "",
      notes: null,
    },
  });
  const files = form.watch("files");
  const importInFlightRef = useRef(false);
  const terminalSuccessRef = useRef(false);
  const previousFileKeyRef = useRef<string | null>(null);
  const previousAutoNameRef = useRef<string | null>(null);
  const selectedActivityFile = files[0] ?? null;
  const isImporting =
    importPhase !== "idle" ||
    getSignedUrlMutation.isPending ||
    processActivityFileMutation.isPending;
  const isFormDisabled = isImporting || importSummary !== null;

  useEffect(() => {
    const fileKey = selectedActivityFile
      ? `${selectedActivityFile.name}:${selectedActivityFile.size}:${String(selectedActivityFile.uri)}`
      : null;

    if (fileKey === previousFileKeyRef.current) {
      return;
    }

    const currentName = form.getValues("name");
    const previousAutoName = previousAutoNameRef.current;

    if (!selectedActivityFile) {
      if (previousAutoName !== null && currentName === previousAutoName) {
        form.setValue("name", "", { shouldDirty: true, shouldValidate: true });
      }
      previousFileKeyRef.current = null;
      previousAutoNameRef.current = null;
      return;
    }

    const nextAutoName = deriveActivityNameFromFileName(selectedActivityFile.name);
    if (!currentName.trim() || currentName === previousAutoName) {
      form.setValue("name", nextAutoName, { shouldDirty: true, shouldValidate: true });
    }

    previousFileKeyRef.current = fileKey;
    previousAutoNameRef.current = nextAutoName;

    if (getSupportedActivityFileExtension(selectedActivityFile.name) === null) {
      form.setError("files", {
        type: "unsupported-extension",
        message: "Choose a FIT, GPX, or TCX file.",
      });
    } else if (form.getFieldState("files").error?.type === "unsupported-extension") {
      form.clearErrors("files");
    }
  }, [form, selectedActivityFile]);

  useEffect(() => {
    const subscription = form.watch(() => setImportError(null));
    return () => subscription.unsubscribe();
  }, [form]);

  const handleHistoricalImport = async (data: ManualActivityImportOutput) => {
    const selectedFile = data.files[0];
    const extension = getSupportedActivityFileExtension(selectedFile.name);

    if (extension === null) {
      form.setError("files", {
        type: "unsupported-extension",
        message: "Choose a FIT, GPX, or TCX file.",
      });
      return;
    }

    if (typeof selectedFile.uri !== "string") {
      setImportError("The selected activity file is unavailable. Choose it again and retry.");
      return;
    }

    if (importInFlightRef.current || terminalSuccessRef.current) {
      return;
    }
    importInFlightRef.current = true;

    setImportError(null);

    try {
      setImportPhase("signing");
      const signedUrlData = await getSignedUrlMutation.mutateAsync({
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
      });

      setImportPhase("uploading");
      const uploader = new ActivityFileUploader(undefined, undefined, "activity-files");
      const uploadResult = await uploader.uploadToSignedUrl(
        selectedFile.uri,
        signedUrlData.signedUrl,
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload activity file");
      }

      setImportPhase("processing");
      const result = await processActivityFileMutation.mutateAsync({
        activityFilePath: signedUrlData.filePath,
        name: data.name,
        notes: data.notes ?? undefined,
        importProvenance: buildManualActivityImportProvenance(selectedFile.name),
      });

      terminalSuccessRef.current = true;
      setImportSummary({
        activityId: result.activity.id,
        name: result.activity.name,
        fileName: selectedFile.name,
      });
      setImportPhase("idle");
      form.reset({
        files: [],
        sport: "bike",
        name: "",
        notes: null,
      });

      await Promise.allSettled([
        Promise.resolve().then(() => invalidatePostActivityIngestionQueries(queryClient)),
        Promise.resolve().then(() => utils.activities.invalidate()),
      ]);
    } catch (error) {
      console.error("Historical activity import failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("File type must be one of")) {
        Alert.alert("Unsupported file", "Only FIT, GPX, and TCX files are supported right now.");
        setImportError("The selected file type is not supported. Choose another file and retry.");
        return;
      }

      if (isActivityParseFailureMessage(message)) {
        Alert.alert(
          "Import failed",
          "We could not read that activity file. Try a different export or recording.",
        );
        setImportError("The activity file could not be read. Choose another export and retry.");
        return;
      }

      setImportError("The activity file could not be imported right now. Please try again.");
    } finally {
      if (!terminalSuccessRef.current) {
        importInFlightRef.current = false;
      }
      setImportPhase("idle");
    }
  };

  const handleViewImportedActivity = () => {
    if (!importSummary) {
      return;
    }

    setNavigationError(null);
    try {
      navigateTo(ROUTES.ACTIVITIES.DETAIL(importSummary.activityId) as Href);
    } catch (error) {
      console.error("Failed to open imported activity", error);
      setNavigationError("Could not open the activity. Tap View Activity to try again.");
    }
  };

  const submitForm = useZodFormSubmit<ManualActivityImportOutput>({
    form,
    onSubmit: handleHistoricalImport,
  });

  return (
    <View className="flex-1 bg-background" testID="activity-import-screen">
      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4 pb-8">
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground">Import Activity History</Text>
          <Text className="text-sm text-muted-foreground">
            Import one completed FIT, GPX, or TCX activity into your normal activity history.
          </Text>
        </View>

        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-4 p-4">
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Icon as={History} size={18} className="text-primary" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-medium text-foreground">Completed Activity File</Text>
                <Text className="text-xs text-muted-foreground">
                  Supported now: `.fit`, `.gpx`, and `.tcx`. Historical imports keep their original
                  timestamps.
                </Text>
              </View>
            </View>

            <Form {...form}>
              <View className="gap-4">
                <FormFileField
                  accept=".fit,.gpx,.tcx"
                  buttonLabel={selectedActivityFile ? "Replace file" : "Choose Activity File"}
                  clearLabel="Remove file"
                  control={form.control}
                  description="One FIT, GPX, or TCX file, up to 50 MiB."
                  disabled={isFormDisabled}
                  label="Completed activity file"
                  name="files"
                  nativeMimeTypes={[...ACTIVITY_FILE_MIME_TYPES]}
                  required
                  testId="activity-import-file-input"
                />

                <FormTextField
                  autoCapitalize="sentences"
                  control={form.control}
                  disabled={isFormDisabled}
                  label="Activity name"
                  name="name"
                  placeholder="Activity name"
                  testId="activity-import-name-input"
                />

                <FormSegmentedSelectField
                  control={form.control}
                  disabled={isFormDisabled}
                  label="Activity type"
                  name="sport"
                  options={ACTIVITY_TYPES.map((activityType) =>
                    createOption(activityType.value, activityType.label),
                  )}
                  testId="activity-import-type-select"
                />

                <FormTextareaField
                  control={form.control}
                  disabled={isFormDisabled}
                  label="Notes"
                  name="notes"
                  formatValue={(value) => value ?? ""}
                  parseValue={(value) => value}
                  placeholder="Optional notes"
                  className="min-h-[88px]"
                  testId="activity-import-notes-input"
                />
              </View>
            </Form>

            {importError ? (
              <View className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                <Text className="text-sm text-destructive">{importError}</Text>
              </View>
            ) : null}

            {importPhase !== "idle" ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-muted-foreground"
                testID="activity-import-phase"
              >
                {IMPORT_PHASE_COPY[importPhase]}
              </Text>
            ) : null}

            <LoadingButton
              onPress={submitForm.handleSubmit}
              disabled={isFormDisabled}
              loading={isImporting}
              loadingLabel={
                importPhase === "idle" ? "Importing Activity…" : IMPORT_PHASE_COPY[importPhase]
              }
              testID="activity-import-submit-button"
            >
              <Text className="font-semibold text-primary-foreground">Import Activity</Text>
            </LoadingButton>
          </CardContent>
        </Card>

        {importSummary ? (
          <View
            className="rounded-xl border border-border bg-muted/40 p-3"
            testID="activity-import-summary"
          >
            <Text className="text-sm font-medium text-foreground">
              Historical activity imported
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              {importSummary.name} was created from {importSummary.fileName}.
            </Text>
            {navigationError ? (
              <Text
                className="mt-2 text-xs text-destructive"
                testID="activity-import-navigation-error"
              >
                {navigationError}
              </Text>
            ) : null}
            <Button
              onPress={handleViewImportedActivity}
              variant="outline"
              className="mt-3"
              testID="activity-import-view-activity-button"
            >
              <Text>View Activity</Text>
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
