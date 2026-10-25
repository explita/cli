import * as tar from "tar";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import ignore from "ignore";
import { PROJECT_CONFIG_FILENAME } from "@explita/infra-protocol";

export const DEFAULT_IGNORED = [
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "*.tgz",
  "*.tar.gz",
];

export function shouldIgnore(entryPath: string): boolean {
  const parts = entryPath.replace(/\\/g, "/").split("/");
  const basename = parts[parts.length - 1] ?? "";
  if (basename === PROJECT_CONFIG_FILENAME) return false;
  if (basename.toLowerCase() === "dockerfile") return false;
  if (basename.endsWith(".tgz") || basename.endsWith(".tar.gz")) return true;
  return parts.some((part) => DEFAULT_IGNORED.includes(part));
}

export function findDockerfile(
  sourceDir: string = process.cwd(),
): string | null {
  const standard = resolve(sourceDir, "Dockerfile");
  if (existsSync(standard)) return standard;

  const lower = resolve(sourceDir, "dockerfile");
  if (existsSync(lower)) return lower;

  return null;
}

export function hasDockerfile(sourceDir: string = process.cwd()): boolean {
  return Boolean(findDockerfile(sourceDir));
}

export function buildIgnoreMatcher(sourceDir: string) {
  const ig = ignore();
  ig.add(DEFAULT_IGNORED);

  const gitignorePath = resolve(sourceDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    try {
      const gitignoreContent = readFileSync(gitignorePath, "utf8");
      ig.add(gitignoreContent);
    } catch {
      // Ignore read errors
    }
  }

  const dockerignorePath = resolve(sourceDir, ".dockerignore");
  if (existsSync(dockerignorePath)) {
    try {
      const dockerignoreContent = readFileSync(dockerignorePath, "utf8");
      ig.add(dockerignoreContent);
    } catch {
      // Ignore read errors
    }
  }

  return (entryPath: string, isDirectory: boolean = false): boolean => {
    let normalized = entryPath
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/^\//, "");
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    if (!normalized || normalized === ".") {
      return false; // Root directory is never ignored
    }
    // explita.json config and Dockerfile must always be shipped to the server,
    // even if listed in .gitignore or .dockerignore
    const baseName = normalized.split("/").pop() || "";
    if (
      baseName === PROJECT_CONFIG_FILENAME ||
      baseName.toLowerCase() === "dockerfile"
    ) {
      return false;
    }
    if (isDirectory) {
      return ig.ignores(normalized) || ig.ignores(`${normalized}/`);
    }
    return ig.ignores(normalized);
  };
}

export async function createTarball(sourceDir: string): Promise<Buffer> {
  const isIgnored = buildIgnoreMatcher(sourceDir);

  const chunks: Buffer[] = [];
  const packStream = tar.c(
    {
      gzip: true,
      cwd: sourceDir,
      filter: (entryPath, stat) => {
        const isDirectory = Boolean(
          stat &&
          typeof (stat as { isDirectory?: () => boolean }).isDirectory ===
            "function" &&
          (stat as { isDirectory: () => boolean }).isDirectory(),
        );
        if (isIgnored(entryPath, isDirectory)) {
          return false;
        }
        return true;
      },
    },
    ["."],
  );

  for await (const chunk of packStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Computes a deterministic SHA-256 fingerprint across all non-ignored files in the source directory.
 * Independent of file modification times or Git status.
 */
export async function computeSourceHash(
  sourceDir: string = process.cwd(),
): Promise<string> {
  const isIgnored = buildIgnoreMatcher(sourceDir);
  const filePaths: string[] = [];

  async function walk(currentDir: string, relativePrefix: string = "") {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = relativePrefix
          ? `${relativePrefix}/${entry.name}`
          : entry.name;
        const isDir = entry.isDirectory();
        if (isIgnored(relPath, isDir)) {
          continue;
        }
        if (isDir) {
          await walk(join(currentDir, entry.name), relPath);
        } else if (entry.isFile()) {
          filePaths.push(relPath);
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }

  await walk(sourceDir);
  filePaths.sort();

  const hasher = createHash("sha256");
  for (const relPath of filePaths) {
    try {
      const content = await readFile(join(sourceDir, relPath));
      const fileDigest = createHash("sha256").update(content).digest("hex");
      hasher.update(`${relPath}:${fileDigest}\n`);
    } catch {
      // Ignore unreadable files
    }
  }

  return hasher.digest("hex");
}
