import * as DocumentPicker from "expo-document-picker";
import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Text } from "../text/index.native";
import type { FileInputProps } from "./shared";

async function pickFiles(multiple: boolean, type?: string) {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple,
    type: type ?? "*/*",
  });

  if (result.canceled) {
    return [];
  }

  return result.assets.map((asset) => ({
    name: asset.name,
    size: asset.size,
    type: asset.mimeType,
    uri: asset.uri,
  }));
}

function FileInput({
  accept,
  buttonLabel = "Choose file",
  error,
  files,
  helperText,
  label,
  multiple = false,
  onFilesChange,
}: FileInputProps) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <Button onPress={async () => onFilesChange?.(await pickFiles(multiple, accept))}>
        <Text className="text-primary-foreground">{buttonLabel}</Text>
      </Button>
      {files?.length ? (
        <Text className="text-xs text-muted-foreground">
          {files.map((file) => file.name).join(", ")}
        </Text>
      ) : null}
      {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}
      {error ? <Text className="text-xs text-destructive">Adjust this field: {error}</Text> : null}
    </View>
  );
}

export { FileInput };
