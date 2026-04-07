import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

export const packageRoot = path.resolve(import.meta.dirname, "..");

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isFlag(token) {
  return token.startsWith("-");
}

export function splitArgs(argv) {
  const components = [];
  const flags = [];

  for (const token of argv) {
    if (token === "--") {
      continue;
    }

    if (isFlag(token)) {
      flags.push(token);
      continue;
    }

    components.push(token);
  }

  return { components, flags };
}

export function normalizeComponentNames(components, prefixes) {
  return components.map((component) => {
    for (const prefix of prefixes) {
      if (component.startsWith(prefix)) {
        return component.slice(prefix.length);
      }
    }

    return component;
  });
}

export async function runCommand(command, args, cwd = packageRoot) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
        return;
      }

      resolve();
    });

    child.on("error", reject);
  });
}

export async function runCapture(command, args, cwd = packageRoot) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed (${code ?? "unknown"})\n${stderr}`));
        return;
      }

      resolve(stdout);
    });

    child.on("error", reject);
  });
}

export async function withTemporaryComponentsConfig(transform, run) {
  const configPath = path.join(packageRoot, "components.json");
  const original = await fs.readFile(configPath, "utf8");

  try {
    const parsed = JSON.parse(original);
    const next = transform(parsed);
    await fs.writeFile(`${configPath}.tmp`, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await fs.rename(`${configPath}.tmp`, configPath);
    return await run();
  } finally {
    await fs.writeFile(configPath, original, "utf8");
  }
}

export async function ensurePlatformEntry({ componentName, platform }) {
  const entryFile = path.join(
    packageRoot,
    "src",
    "components",
    componentName,
    platform === "web" ? "index.web.tsx" : "index.native.tsx",
  );

  try {
    await fs.access(entryFile);
    return false;
  } catch {
    // continue
  }

  await fs.mkdir(path.dirname(entryFile), { recursive: true });

  const registryImport = toPosixPath(
    path.relative(
      path.dirname(entryFile),
      path.join(packageRoot, "src", "registry", platform, componentName),
    ),
  );

  await fs.writeFile(entryFile, `export * from "${registryImport}";\n`, "utf8");
  return true;
}

function rewriteWebImports(content) {
  return content
    .replaceAll(/from\s+["']@\/lib\/utils["']/g, 'from "../../lib/cn"')
    .replaceAll(/from\s+["']@\/registry\/[^/]+\/ui\/([^"']+)["']/g, 'from "./$1"');
}

function rewriteNativeImports(content) {
  return content
    .replaceAll(/from\s+["']@\/registry\/nativewind\/lib\/utils["']/g, 'from "../../lib/cn"')
    .replaceAll(/from\s+["']@\/registry\/nativewind\/components\/ui\/([^"']+)["']/g, 'from "./$1"');
}

export async function downloadRegistryItem({ componentName, registryName, platform }) {
  const viewTarget = registryName ?? componentName;
  const stdout = await runCapture("pnpm", [
    "dlx",
    "shadcn@latest",
    "view",
    viewTarget,
    "--cwd",
    ".",
  ]);

  const parsed = JSON.parse(stdout);
  const item = Array.isArray(parsed) ? parsed[0] : parsed;

  if (!item?.files?.length) {
    throw new Error(`No registry files returned for ${viewTarget}`);
  }

  const primaryFile =
    item.files.find((file) => file.path.includes(`${componentName}.`)) ?? item.files[0];
  const extension = path.extname(primaryFile.path) || ".tsx";
  const outputPath = path.join(
    packageRoot,
    "src",
    "registry",
    platform,
    `${componentName}${extension}`,
  );
  const nextContent =
    platform === "web"
      ? rewriteWebImports(primaryFile.content)
      : rewriteNativeImports(primaryFile.content);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${nextContent.trimEnd()}\n`, "utf8");
}

export async function syncRegistryMirrors({ components, platform, registryPrefix }) {
  for (const componentName of components) {
    await downloadRegistryItem({
      componentName,
      platform,
      registryName: registryPrefix ? `${registryPrefix}${componentName}` : undefined,
    });
    await ensurePlatformEntry({ componentName, platform });
  }
}
