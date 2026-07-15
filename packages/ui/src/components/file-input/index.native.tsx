import * as DocumentPicker from "expo-document-picker";
import { useId } from "react";
import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Text } from "../text/index.native";
import type { FileInputProps, SelectedFile } from "./shared";
import { formatFileSize } from "./shared";

async function pickFiles(multiple: boolean, type?: string | string[]) {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple,
    type: type ?? "*/*",
  });

  if (result.canceled) {
    return undefined;
  }

  return result.assets.map((asset) => ({
    name: asset.name,
    size: asset.size,
    type: asset.mimeType,
    uri: asset.uri,
  }));
}

function FileInput({
  buttonLabel,
  clearLabel = "Clear files",
  disabled = false,
  error,
  files = [],
  helperText,
  hideLabel = false,
  id,
  label,
  multiple = false,
  name,
  nativeMimeTypes,
  onBlur,
  onFilesChange,
  removeLabel = (file) => `Remove ${file.name}`,
  required = false,
  testId,
  testID,
}: FileInputProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const labelId = `${baseId}-label`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const accessibilityHint = [helperText, error].filter(Boolean).join(". ");
  const resolvedTestId = testId ?? testID;
  const resolvedButtonLabel =
    buttonLabel ??
    (files.length
      ? multiple
        ? "Replace files"
        : "Replace file"
      : multiple
        ? "Choose files"
        : "Choose file");

  const updateFiles = (nextFiles: SelectedFile[]) => {
    if (disabled) {
      return;
    }

    onFilesChange?.(nextFiles);
    onBlur?.();
  };

  const openPicker = async () => {
    if (disabled) {
      return;
    }

    const selected = await pickFiles(multiple, nativeMimeTypes);
    if (selected) {
      updateFiles(selected);
    }
  };

  return (
    <View {...({ name } as Record<string, string | undefined>)} className="gap-2" nativeID={baseId}>
      {hideLabel ? null : (
        <Text className="text-sm font-medium text-foreground" nativeID={labelId}>
          {label}
          {required ? <Text className="text-destructive"> *</Text> : null}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          accessibilityHint={accessibilityHint || undefined}
          accessibilityLabel={label}
          accessibilityLabelledBy={hideLabel ? undefined : labelId}
          accessibilityState={{ disabled }}
          aria-invalid={Boolean(error)}
          aria-required={required}
          disabled={disabled}
          onPress={openPicker}
          testId={resolvedTestId}
        >
          <Text>{resolvedButtonLabel}</Text>
        </Button>
        {files.length ? (
          <Button
            accessibilityLabel={clearLabel}
            disabled={disabled}
            onPress={() => updateFiles([])}
            testId={resolvedTestId ? `${resolvedTestId}-clear` : undefined}
            variant="outline"
          >
            <Text>{clearLabel}</Text>
          </Button>
        ) : null}
      </View>
      {files.map((file, index) => (
        <View
          accessibilityLabel={`${file.name}, ${formatFileSize(file.size)}`}
          className="flex-row items-center justify-between gap-2"
          key={`${file.uri ?? file.name}-${file.size ?? "unknown"}-${file.type ?? "unknown"}`}
        >
          <Text className="text-xs text-muted-foreground">
            {file.name} ({formatFileSize(file.size)})
          </Text>
          <Button
            accessibilityLabel={removeLabel(file, index)}
            disabled={disabled}
            onPress={() => updateFiles(files.filter((_, fileIndex) => fileIndex !== index))}
            testId={resolvedTestId ? `${resolvedTestId}-remove-${index}` : undefined}
            variant="ghost"
          >
            <Text>Remove</Text>
          </Button>
        </View>
      ))}
      {helperText ? (
        <Text className="text-xs text-muted-foreground" nativeID={helperId}>
          {helperText}
        </Text>
      ) : null}
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-destructive"
          nativeID={errorId}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export { FileInput };
