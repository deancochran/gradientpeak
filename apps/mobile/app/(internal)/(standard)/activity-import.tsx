import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormSelectField, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { CheckCircle, FileText, History, Upload } from "lucide-react-native";
import React, { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { z } from "zod";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { FitUploader } from "@/lib/services/fit/FitUploader";

const ACTIVITY_TYPES = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Ride" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
] as const;

const activityImportSchema = z.object({
  historicalName: z.string().trim().min(1, "Enter a name for this imported activity."),
  historicalNotes: z.string(),
  historicalActivityType: z.enum(["run", "bike", "swim", "strength", "other"]),
});

function isFitParseFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to parse fit file") ||
    normalized.includes("fit decode") ||
    normalized.includes("fit parser") ||
    normalized.includes("fit parse") ||
    normalized.includes("corrupt fit") ||
    normalized.includes("invalid fit") ||
    normalized.includes("bar error")
  );
}

const createOption = (value: string, label?: string) => ({
  value,
  label: label || value,
});

const buildManualHistoricalImportProvenance = (fileName: string) => ({
  import_source: "manual_historical" as const,
  import_file_type: "fit" as const,
  import_original_file_name: fileName.trim(),
});

export default function ActivityImportScreen() {
  const navigateTo = useAppNavigate();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const [selectedFitFile, setSelectedFitFile] = useState<{
    name: string;
    uri: string;
    size: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    activityId: string;
    name: string;
    fileName: string;
  } | null>(null);

  const getSignedUrlMutation = api.fitFiles.getSignedUploadUrl.useMutation();
  const processFitFileMutation = api.fitFiles.processFitFile.useMutation();
  const isImporting = getSignedUrlMutation.isPending || processFitFileMutation.isPending;
  const form = useZodForm({
    schema: activityImportSchema,
    defaultValues: {
      historicalActivityType: "bike",
      historicalName: "",
      historicalNotes: "",
    },
  });

  const handlePickFitFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];

      if (!asset.name.toLowerCase().endsWith(".fit")) {
        Alert.alert("Unsupported file", "Choose a FIT file ending in .fit.");
        return;
      }

      const file = new File(asset.uri);
      const fileSize = asset.size ?? file.size ?? 0;

      if (fileSize <= 0) {
        Alert.alert("Unreadable file", "The selected FIT file appears to be empty.");
        return;
      }

      setSelectedFitFile({
        name: asset.name,
        uri: asset.uri,
        size: fileSize,
      });
      setImportError(null);

      if (!(form.getValues("historicalName") || "").trim()) {
        form.setValue("historicalName", asset.name.replace(/\.fit$/i, ""), { shouldDirty: true });
      }
    } catch (error) {
      console.error("Failed to pick FIT file", error);
      Alert.alert("File selection failed", "Could not open the FIT file picker.");
    }
  };

  const handleHistoricalImport = async (data: z.infer<typeof activityImportSchema>) => {
    const trimmedName = data.historicalName.trim();

    if (!selectedFitFile) {
      setImportError("Choose a FIT file to import.");
      return;
    }

    setImportError(null);

    try {
      const signedUrlData = await getSignedUrlMutation.mutateAsync({
        fileName: selectedFitFile.name,
        fileSize: selectedFitFile.size,
      });

      const uploader = new FitUploader(undefined, undefined, "fit-files");
      const uploadResult = await uploader.uploadToSignedUrl(
        selectedFitFile.uri,
        signedUrlData.signedUrl,
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload FIT file");
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await processFitFileMutation.mutateAsync({
        fitFilePath: signedUrlData.filePath,
        name: trimmedName,
        notes: data.historicalNotes.trim() || undefined,
        activityType: data.historicalActivityType,
        importProvenance: buildManualHistoricalImportProvenance(selectedFitFile.name),
      });

      await invalidatePostActivityIngestionQueries(queryClient);
      await utils.activities.invalidate();

      setImportSummary({
        activityId: result.activity.id,
        name: result.activity.name,
        fileName: selectedFitFile.name,
      });
      setSelectedFitFile(null);
      form.reset({
        historicalActivityType: "bike",
        historicalName: "",
        historicalNotes: "",
      });
    } catch (error) {
      console.error("Historical FIT import failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("Only .fit files are supported")) {
        Alert.alert("Unsupported file", "Only FIT files are supported right now.");
        return;
      }

      if (isFitParseFailureMessage(message)) {
        Alert.alert(
          "Import failed",
          "We could not read that FIT file. Try a different export or recording.",
        );
        return;
      }

      setImportError("The FIT activity could not be imported right now. Please try again.");
    }
  };

  const submitForm = useZodFormSubmit<z.infer<typeof activityImportSchema>>({
    form,
    onSubmit: handleHistoricalImport,
  });

  return (
    <View className="flex-1 bg-background" testID="activity-import-screen">
      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4 pb-8">
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground">Import Activity History</Text>
          <Text className="text-sm text-muted-foreground">
            Import one completed FIT activity into your normal activity history.
          </Text>
        </View>

        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="gap-4 p-4">
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <History size={18} className="text-primary" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-medium text-foreground">Completed FIT Activity</Text>
                <Text className="text-xs text-muted-foreground">
                  Supported now: `.fit` only. Historical imports keep their original timestamps.
                </Text>
              </View>
            </View>

            {!selectedFitFile ? (
              <Button
                onPress={handlePickFitFile}
                variant="outline"
                className="justify-start gap-2"
                disabled={isImporting}
                testID="activity-import-pick-fit-file-button"
              >
                <Upload className="text-foreground" size={18} />
                <Text>Choose FIT File</Text>
              </Button>
            ) : (
              <View className="gap-2 rounded-xl border border-border bg-muted/40 p-3">
                <View className="flex-row items-center gap-2">
                  <FileText className="text-foreground" size={18} />
                  <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                    {selectedFitFile.name}
                  </Text>
                  <CheckCircle className="text-green-600" size={18} />
                </View>
                <Text className="text-xs text-muted-foreground">
                  {(selectedFitFile.size / (1024 * 1024)).toFixed(2)} MB
                </Text>
                <Button
                  onPress={handlePickFitFile}
                  variant="ghost"
                  className="self-start px-0"
                  disabled={isImporting}
                >
                  <Text className="text-sm font-medium text-primary">Choose a different file</Text>
                </Button>
              </View>
            )}

            <Form {...form}>
              <View className="gap-4">
                <FormTextField
                  autoCapitalize="sentences"
                  control={form.control}
                  disabled={isImporting}
                  label="Activity name"
                  name="historicalName"
                  placeholder="Activity name"
                  testId="activity-import-name-input"
                />

                <FormSelectField
                  control={form.control}
                  label="Activity type"
                  name="historicalActivityType"
                  options={ACTIVITY_TYPES.map((activityType) =>
                    createOption(activityType.value, activityType.label),
                  )}
                  placeholder="Choose activity type"
                  testId="activity-import-type-select"
                />

                <FormTextareaField
                  control={form.control}
                  disabled={isImporting}
                  label="Notes"
                  name="historicalNotes"
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

            <Button
              onPress={submitForm.handleSubmit}
              disabled={isImporting || !selectedFitFile}
              testID="activity-import-submit-button"
            >
              <Text className="font-semibold text-primary-foreground">
                {isImporting ? "Importing FIT Activity..." : "Import FIT Activity"}
              </Text>
            </Button>
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
            <Button
              onPress={() => navigateTo(ROUTES.ACTIVITIES.DETAIL(importSummary.activityId) as any)}
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
