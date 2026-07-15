import type { TestProps } from "../../lib/test-props";

export type SelectedFile = {
  name: string;
  size?: number | null;
  type?: string | null;
  uri?: string;
  file?: File;
};

export interface FileInputProps extends TestProps {
  label: string;
  name?: string;
  files?: SelectedFile[];
  onFilesChange?: (files: SelectedFile[]) => void;
  onBlur?: () => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  /** Web file accept syntax, such as `image/*` or `.fit,.gpx`. */
  accept?: string;
  /** MIME type filters passed to Expo DocumentPicker on native. */
  nativeMimeTypes?: string | string[];
  multiple?: boolean;
  buttonLabel?: string;
  clearLabel?: string;
  removeLabel?: (file: SelectedFile, index: number) => string;
  /** Lets form wrappers provide their label while retaining an accessible input label. */
  hideLabel?: boolean;
}

export function formatFileSize(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size) || size < 0) {
    return "Size unknown";
  }

  if (size < 1024) {
    return `${size} ${size === 1 ? "byte" : "bytes"}`;
  }

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
