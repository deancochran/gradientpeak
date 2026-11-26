import {
  chmodSync,
  copyFileSync,
  existsSync,
  type MakeDirectoryOptions,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

type ScreenshotFileOps = {
  chmodSync: (path: string, mode: number) => void;
  copyFileSync: (source: string, destination: string) => void;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options: MakeDirectoryOptions) => string | undefined;
  rmSync: (path: string, options: { force: true }) => void;
};

const defaultFileOps: ScreenshotFileOps = {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
};

function screenshotPath(root: string, name: string) {
  return join(root, `${name}.png`);
}

/**
 * Retains only declared screenshots and always clears every declared cwd source.
 * Debug and retained artifact paths remain available for failure inspection.
 */
export function retainGoalEditFlowScreenshots(input: {
  artifactDirectory: string;
  cwdDirectory: string;
  debugDirectory: string;
  names: readonly string[];
  fileOps?: ScreenshotFileOps;
}) {
  const {
    artifactDirectory,
    cwdDirectory,
    debugDirectory,
    names,
    fileOps = defaultFileOps,
  } = input;
  const cwdSources = names.map((name) => screenshotPath(cwdDirectory, name));
  const retained: string[] = [];
  try {
    fileOps.mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 });
    fileOps.chmodSync(artifactDirectory, 0o700);
    for (const name of names) {
      const destination = screenshotPath(artifactDirectory, name);
      for (const source of [
        screenshotPath(debugDirectory, name),
        screenshotPath(cwdDirectory, name),
      ]) {
        if (!fileOps.existsSync(source)) continue;
        fileOps.copyFileSync(source, destination);
        fileOps.chmodSync(destination, 0o600);
        retained.push(name);
        break;
      }
    }
    return retained;
  } finally {
    // These exact cwd names are owned by this flow. Cleanup covers setup and
    // every copy failure, including later names not reached by the loop.
    for (const source of cwdSources) fileOps.rmSync(source, { force: true });
  }
}
