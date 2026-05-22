import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";

type UseActivityPlanRouteUploadParams = {
  planName: string;
  onRouteUploaded: (routeId: string) => void;
};

export function useActivityPlanRouteUpload({
  onRouteUploaded,
  planName,
}: UseActivityPlanRouteUploadParams) {
  const utils = api.useUtils();
  const [isUploadingRoute, setIsUploadingRoute] = useState(false);

  const uploadRouteMutation = api.routes.upload.useMutation({
    onSuccess: (data) => {
      onRouteUploaded(data.id);
      setIsUploadingRoute(false);
      void utils.routes.invalidate();
    },
    onError: () => {
      Alert.alert("Error", "Failed to upload route. Please try again.");
      setIsUploadingRoute(false);
    },
  });

  const pickGpxFile = async () => {
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
      const fileName = file.name.replace(/\.gpx$/i, "");

      setIsUploadingRoute(true);
      uploadRouteMutation.mutate({
        name: fileName,
        description: `Uploaded for ${planName || "activity plan"}`,
        fileContent: content,
        fileName: file.name,
      });
    } catch {
      Alert.alert("Error", "Failed to read GPX file");
      setIsUploadingRoute(false);
    }
  };

  return {
    isUploadingRoute,
    pickGpxFile,
  };
}
