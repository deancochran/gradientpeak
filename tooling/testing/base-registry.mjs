import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function loadBaseRegistry(
  root,
  base,
  {
    run = execFileAsync,
    makeTemporaryDirectory = mkdtemp,
    remove = rm,
    link = symlink,
    write = writeFile,
    load = (url) => import(url),
  } = {},
) {
  const temporaryDirectory = await makeTemporaryDirectory(
    path.join(os.tmpdir(), "gradientpeak-capability-base-"),
  );
  try {
    const baseSource = await run("git", ["show", `${base}:packages/core/parity/index.ts`], {
      cwd: root,
    });
    const basePath = path.join(temporaryDirectory, "index.ts");
    await link(path.join(root, "node_modules"), path.join(temporaryDirectory, "node_modules"));
    await write(basePath, baseSource.stdout);
    return await load(`${pathToFileURL(basePath).href}?base=${Date.now()}`);
  } finally {
    await remove(temporaryDirectory, { recursive: true, force: true });
  }
}
