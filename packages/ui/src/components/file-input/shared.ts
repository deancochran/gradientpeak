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
  files?: SelectedFile[];
  onFilesChange?: (files: SelectedFile[]) => void;
  helperText?: string;
  error?: string;
  required?: boolean;
  accept?: string;
  multiple?: boolean;
  buttonLabel?: string;
}
