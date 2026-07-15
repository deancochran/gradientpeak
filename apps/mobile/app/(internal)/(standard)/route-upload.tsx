import { deriveRouteNameFromFileName, ROUTE_FILE_NATIVE_MIME_TYPES } from "@repo/core/route-files";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormFileField, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Stack, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import {
  getRouteFileReadErrorMessage,
  nativeRouteFileMetadataSchema,
  readRouteFileText,
} from "@/lib/route-files/native-route-file";
import { handleSubmitFormError } from "@/lib/utils/formErrors";
import { type RouteUploadFormValues, routeUploadFormSchema } from "@/lib/validation/route-upload";

type UploadPhase = "idle" | "reading" | "uploading" | "success";

export default function UploadRouteScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const uploadInFlightRef = useRef(false);
  const terminalSuccessRef = useRef(false);
  const previousFileKeyRef = useRef<string | null>(null);
  const previousAutoNameRef = useRef<string | null>(null);
  const form = useZodForm({
    schema: routeUploadFormSchema,
    defaultValues: {
      files: [],
      name: "",
      description: "",
    },
  });

  const uploadMutation = api.routes.upload.useMutation();
  const files = form.watch("files");
  const selectedFile = files[0] ?? null;
  const isFormDisabled =
    uploadPhase !== "idle" || uploadMutation.isPending || terminalSuccessRef.current;

  useEffect(() => {
    const fileKey = selectedFile
      ? `${selectedFile.name}:${selectedFile.size}:${String(selectedFile.uri)}`
      : null;
    if (fileKey === previousFileKeyRef.current) {
      return;
    }

    const currentName = form.getValues("name");
    const previousAutoName = previousAutoNameRef.current;
    if (!selectedFile) {
      if (previousAutoName !== null && currentName === previousAutoName) {
        form.setValue("name", "", { shouldDirty: true, shouldValidate: true });
      }
      previousFileKeyRef.current = null;
      previousAutoNameRef.current = null;
      return;
    }

    const nextAutoName = deriveRouteNameFromFileName(selectedFile.name);
    if (!currentName.trim() || currentName === previousAutoName) {
      form.setValue("name", nextAutoName, { shouldDirty: true, shouldValidate: true });
    }
    previousFileKeyRef.current = fileKey;
    previousAutoNameRef.current = nextAutoName;

    const metadataResult = nativeRouteFileMetadataSchema.safeParse(selectedFile);
    if (!metadataResult.success) {
      form.setError("files", {
        type: "invalid-route-metadata",
        message: metadataResult.error.issues[0]?.message ?? "Choose a valid route file.",
      });
    } else if (form.getFieldState("files").error?.type === "invalid-route-metadata") {
      form.clearErrors("files");
    }
  }, [form, selectedFile]);

  useEffect(() => {
    const subscription = form.watch(() => {
      if (!terminalSuccessRef.current) {
        form.clearErrors("root");
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const submitForm = useZodFormSubmit<RouteUploadFormValues>({
    form,
    shouldRethrow: false,
    onSubmit: async (values) => {
      if (uploadInFlightRef.current || terminalSuccessRef.current) {
        return;
      }
      uploadInFlightRef.current = true;
      form.clearErrors("root");
      const file = values.files[0];
      const fileUri = file.uri;

      if (typeof fileUri !== "string" || fileUri.length === 0) {
        form.setError("files", {
          type: "missing-uri",
          message: "The selected route file is unavailable. Choose it again.",
        });
        uploadInFlightRef.current = false;
        return;
      }

      try {
        setUploadPhase("reading");
        const readAndUpload = async () => {
          let fileContent: string;
          try {
            fileContent = await readRouteFileText(fileUri);
          } catch (error) {
            form.setError("root", {
              message: getRouteFileReadErrorMessage(error),
            });
            return false;
          }

          setUploadPhase("uploading");
          await uploadMutation.mutateAsync({
            name: values.name,
            description: values.description ?? undefined,
            fileContent,
            fileName: file.name,
          });
          return true;
        };
        if (!(await readAndUpload())) {
          return;
        }

        terminalSuccessRef.current = true;
        setUploadPhase("success");
        await Promise.allSettled([Promise.resolve().then(() => utils.routes.invalidate())]);

        try {
          router.back();
        } catch {
          form.setError("root", {
            message: "Route uploaded, but this screen could not close. Use Back to continue.",
          });
        }
      } catch (error) {
        handleSubmitFormError(form, error, { preferRootError: true });
      } finally {
        if (!terminalSuccessRef.current) {
          uploadInFlightRef.current = false;
          setUploadPhase("idle");
        }
      }
    },
    onError: (error) => {
      handleSubmitFormError(form, error, { preferRootError: true });
    },
  });

  const submitLabel =
    uploadPhase === "reading"
      ? "Reading..."
      : uploadPhase === "uploading"
        ? "Uploading..."
        : uploadPhase === "success"
          ? "Uploaded"
          : "Upload Route";

  return (
    <View className="flex-1 bg-background" testID="route-upload-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={submitForm.handleSubmit}
              disabled={isFormDisabled || submitForm.isSubmitting}
              className="mr-2 rounded-full px-2 py-1"
              testID="route-upload-submit-button"
            >
              <Text
                className={
                  isFormDisabled || submitForm.isSubmitting
                    ? "text-sm font-medium text-muted-foreground"
                    : "text-sm font-medium text-primary"
                }
              >
                {submitLabel}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
        <Form {...form}>
          <View className="gap-6">
            <Card>
              <CardContent className="p-4">
                <FormFileField
                  control={form.control}
                  description="Select one GPX, TCX, or XML route file from your device."
                  disabled={isFormDisabled}
                  label="Route File"
                  name="files"
                  nativeMimeTypes={[...ROUTE_FILE_NATIVE_MIME_TYPES]}
                  required
                  testId="route-upload-file-input"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="gap-4 p-4">
                <FormTextField
                  control={form.control}
                  label="Route Name"
                  name="name"
                  placeholder="e.g., Morning Hill Climb"
                  required
                  disabled={isFormDisabled}
                  testId="route-upload-name-input"
                />

                <FormTextareaField
                  control={form.control}
                  label="Description"
                  name="description"
                  placeholder="Add notes about this route..."
                  description="Optional"
                  className="min-h-[80px]"
                  disabled={isFormDisabled}
                />

                {form.formState.errors.root?.message ? (
                  <Alert icon={AlertCircle} variant="destructive" testID="route-upload-root-error">
                    <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <Text className="text-sm text-muted-foreground">
                  💡 The route will be analyzed to calculate distance, elevation gain, and create a
                  preview map. You can attach this route to activity plans later.
                </Text>
              </CardContent>
            </Card>
          </View>
        </Form>
      </ScrollView>
    </View>
  );
}
