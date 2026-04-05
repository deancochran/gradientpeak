import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { AlertCircle, CheckCircle, FileText, Upload } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils/formErrors";
import {
  type RouteUploadFormValues,
  routeUploadActivityCategoryOptions,
  routeUploadFormSchema,
} from "@/lib/validation/route-upload";

export default function UploadRouteScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const form = useZodForm({
    schema: routeUploadFormSchema,
    defaultValues: {
      name: "",
      description: "",
      activityCategory: "run",
      fileName: "",
      fileContent: "",
    },
  });

  const uploadMutation = api.routes.upload.useMutation({
    onSuccess: async () => {
      await utils.routes.invalidate();
      router.back();
    },
  });

  const selectedFileName = form.watch("fileName");

  const handlePickFile = async () => {
    form.clearErrors(["fileName", "fileContent", "root"]);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "text/xml", "application/xml"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const file = result.assets[0];
      const response = await fetch(file.uri);
      const content = await response.text();

      form.setValue("fileName", file.name, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      form.setValue("fileContent", content, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });

      if (!String(form.getValues("name") ?? "").trim() && file.name) {
        form.setValue("name", file.name.replace(/\.gpx$/i, ""), {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    } catch (error) {
      form.setError("root", {
        message: getErrorMessage(error),
      });
    }
  };

  const submitForm = useZodFormSubmit<RouteUploadFormValues>({
    form,
    onSubmit: async (values) => {
      form.clearErrors("root");

      try {
        await uploadMutation.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          activityCategory: values.activityCategory,
          fileContent: values.fileContent,
          fileName: values.fileName,
        });
      } catch (error) {
        form.setError("root", {
          message: getErrorMessage(error),
        });
      }
    },
  });

  const isSubmitting = uploadMutation.isPending || submitForm.isSubmitting;

  return (
    <View className="flex-1 bg-background" testID="route-upload-screen">
      <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
        <Form {...form}>
          <View className="gap-6">
            <Card>
              <CardContent className="p-4">
                <FormField
                  control={form.control}
                  name="fileName"
                  render={() => (
                    <FormItem>
                      <FormLabel>GPX File *</FormLabel>
                      <FormControl>
                        {!selectedFileName ? (
                          <Button
                            onPress={handlePickFile}
                            variant="outline"
                            className="w-full justify-start gap-2"
                            testID="route-upload-pick-file-button"
                          >
                            <Upload className="text-foreground" size={20} />
                            <Text>Choose GPX File</Text>
                          </Button>
                        ) : (
                          <View className="flex-row items-center gap-2 rounded-lg bg-muted p-3">
                            <FileText className="text-foreground" size={20} />
                            <Text className="flex-1" numberOfLines={1}>
                              {selectedFileName}
                            </Text>
                            <CheckCircle className="text-green-500" size={20} />
                            <Button
                              onPress={handlePickFile}
                              variant="ghost"
                              size="sm"
                              testID="route-upload-change-file-button"
                            >
                              <Text className="text-xs">Change</Text>
                            </Button>
                          </View>
                        )}
                      </FormControl>
                      <FormDescription>Select a GPX file from your device</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
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
                  testId="route-upload-name-input"
                />

                <FormSelectField
                  control={form.control}
                  label="Activity Category"
                  name="activityCategory"
                  options={routeUploadActivityCategoryOptions.map((option) => ({ ...option }))}
                  placeholder="Select activity category"
                  required
                />

                <FormTextareaField
                  control={form.control}
                  label="Description"
                  name="description"
                  placeholder="Add notes about this route..."
                  description="Optional"
                  className="min-h-[80px]"
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

      <View className="border-t border-border bg-card p-4">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => {
              form.clearErrors("root");
              router.back();
            }}
            disabled={isSubmitting}
            testID="route-upload-cancel-button"
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            className="flex-1"
            onPress={submitForm.handleSubmit}
            disabled={isSubmitting}
            testID="route-upload-submit-button"
          >
            <Text className="text-primary-foreground">
              {isSubmitting ? "Uploading..." : "Upload Route"}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
