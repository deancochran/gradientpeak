import {
  deriveRouteNameFromFileName,
  getRouteFileExtension,
  MAX_ROUTE_FILE_SIZE_BYTES,
  ROUTE_FILE_NATIVE_MIME_TYPES,
} from "@repo/core/route-files";
import * as DocumentPicker from "expo-document-picker";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import {
  getRouteFileReadErrorMessage,
  nativeRouteFileMetadataSchema,
  RouteFileReadError,
  readRouteFileText,
} from "@/lib/route-files/native-route-file";

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
  const uploadInFlightRef = useRef(false);

  const uploadRouteMutation = api.routes.upload.useMutation();

  const pickGpxFile = async () => {
    if (uploadInFlightRef.current) {
      return;
    }
    uploadInFlightRef.current = true;
    setIsUploadingRoute(true);

    try {
      let result: DocumentPicker.DocumentPickerResult;
      try {
        result = await DocumentPicker.getDocumentAsync({
          type: [...ROUTE_FILE_NATIVE_MIME_TYPES],
          copyToCacheDirectory: true,
        });
      } catch {
        Alert.alert("Route selection failed", "Could not select a route file. Please try again.");
        return;
      }

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const file = result.assets[0];
      if (getRouteFileExtension(file.name) === null) {
        Alert.alert("Unsupported route file", "Choose a GPX, TCX, or XML route file.");
        return;
      }
      if (typeof file.size === "number" && file.size > MAX_ROUTE_FILE_SIZE_BYTES) {
        Alert.alert("Route file too large", "Choose a route file no larger than 10 MB.");
        return;
      }
      const metadata = nativeRouteFileMetadataSchema.safeParse({
        name: file.name,
        size: file.size,
        type: file.mimeType,
        uri: file.uri,
      });
      if (!metadata.success) {
        Alert.alert(
          "Invalid route file",
          "The selected route file metadata is incomplete or unsafe. Choose another file.",
        );
        return;
      }

      const readAndUpload = async () => {
        let content: string;
        try {
          content = await readRouteFileText(file.uri);
        } catch (error) {
          const title =
            error instanceof RouteFileReadError && error.code === "empty"
              ? "Empty route file"
              : error instanceof RouteFileReadError && error.code === "oversized"
                ? "Route file too large"
                : "Route read failed";
          Alert.alert(title, getRouteFileReadErrorMessage(error));
          return null;
        }

        try {
          return await uploadRouteMutation.mutateAsync({
            name: deriveRouteNameFromFileName(metadata.data.name),
            description: `Uploaded for ${planName || "activity plan"}`,
            fileContent: content,
            fileName: metadata.data.name,
          });
        } catch {
          Alert.alert("Route upload failed", "Failed to upload route. Please try again.");
          return null;
        }
      };
      const uploadResult = await readAndUpload();
      if (!uploadResult) {
        return;
      }

      onRouteUploaded(uploadResult.id);
      void utils.routes.invalidate().catch(() => undefined);
    } finally {
      uploadInFlightRef.current = false;
      setIsUploadingRoute(false);
    }
  };

  return {
    isUploadingRoute,
    pickGpxFile,
  };
}
