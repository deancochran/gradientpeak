import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { CheckCircle, FileText, Upload } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

const ACTIVITY_CATEGORIES = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
];

// Helper to create Option objects for Select components
const createOption = (value: string, label?: string) => ({
  value,
  label: label || value,
});

export default function UploadRouteScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activityCategory, setActivityCategory] = useState<string>("run");
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const uploadMutation = useReliableMutation(trpc.routes.upload, {
    invalidate: [utils.routes],
    success: "Route uploaded successfully!",
    onSuccess: () => router.back(),
  });

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "text/xml", "application/xml"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];

        // Read file content
        const response = await fetch(file.uri);
        const content = await response.text();

        setSelectedFile({
          name: file.name,
          content: content,
        });

        // Auto-fill name from filename if empty
        if (!name && file.name) {
          const fileName = file.name.replace(/\.gpx$/i, "");
          setName(fileName);
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to read file");
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      Alert.alert("Error", "Please select a GPX file");
      return;
    }

    if (!name.trim()) {
      Alert.alert("Error", "Please enter a route name");
      return;
    }

    uploadMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      activityCategory: activityCategory as any,
      fileContent: selectedFile.content,
      fileName: selectedFile.name,
    });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 p-4">
        <View className="gap-6">
          {/* File Picker */}
          <Card>
            <CardContent className="p-4">
              <Label className="mb-2">GPX File</Label>
              {!selectedFile ? (
                <Button
                  onPress={handlePickFile}
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  <Upload className="text-foreground" size={20} />
                  <Text>Choose GPX File</Text>
                </Button>
              ) : (
                <View className="flex-row items-center gap-2 p-3 bg-muted rounded-lg">
                  <FileText className="text-foreground" size={20} />
                  <Text className="flex-1" numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <CheckCircle className="text-green-500" size={20} />
                  <Button onPress={handlePickFile} variant="ghost" size="sm">
                    <Text className="text-xs">Change</Text>
                  </Button>
                </View>
              )}
              <Text className="text-xs text-muted-foreground mt-2">
                Select a GPX file from your device
              </Text>
            </CardContent>
          </Card>

          {/* Route Details */}
          <Card>
            <CardContent className="p-4 gap-4">
              <View>
                <Label className="mb-2">Route Name *</Label>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Morning Hill Climb"
                  maxLength={100}
                />
              </View>

              <View>
                <Label className="mb-2">Activity Category *</Label>
                <Select
                  value={createOption(activityCategory)}
                  onValueChange={(
                    option: { value: string; label: string } | undefined,
                  ) => {
                    if (option) setActivityCategory(option.value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select activity category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ACTIVITY_CATEGORIES.map((category) => (
                        <SelectItem
                          key={category.value}
                          value={category.value}
                          label={category.label}
                        />
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>

              <View>
                <Label className="mb-2">Description (Optional)</Label>
                <Textarea
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add notes about this route..."
                  className="min-h-[80px]"
                  maxLength={1000}
                  multiline
                />
              </View>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <Text className="text-sm text-muted-foreground">
                💡 The route will be analyzed to calculate distance, elevation
                gain, and create a preview map. You can attach this route to
                activity plans later.
              </Text>
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="p-4 border-t border-border bg-card">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => router.back()}
            disabled={uploadMutation.isPending}
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            className="flex-1"
            onPress={handleUpload}
            disabled={uploadMutation.isPending || !selectedFile || !name.trim()}
          >
            <Text className="text-primary-foreground">
              {uploadMutation.isPending ? "Uploading..." : "Upload Route"}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
