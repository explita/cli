import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { findDockerfile } from "./archive.js";

function parsePortNumber(val: unknown): number | undefined {
  if (!val) return undefined;
  const num = typeof val === "number" ? val : parseInt(String(val), 10);
  if (!isNaN(num) && num > 0 && num <= 65535) {
    return num;
  }
  return undefined;
}

function extractPortFromCommand(cmd: string): number | undefined {
  // Check for PORT=env prefix (e.g. PORT=4000 next start, cross-env PORT=4000 node server.js)
  const envMatch = cmd.match(/(?:^|\s+)PORT\s*=\s*["']?(\d+)["']?/i);
  if (envMatch && envMatch[1]) {
    const p = parsePortNumber(envMatch[1]);
    if (p) return p;
  }

  // Check for -p or --port flag (e.g. next start -p 4000, vite preview --port 4000, next start -p=4000)
  const flagMatch = cmd.match(/(?:^|\s)(?:-p|--port)[=\s]+["']?(\d+)["']?/i);
  if (flagMatch && flagMatch[1]) {
    const p = parsePortNumber(flagMatch[1]);
    if (p) return p;
  }

  return undefined;
}

/**
 * Auto-detect the project port by inspecting package.json scripts and Dockerfile/dockerfile.
 */
export function detectProjectPort(cwd: string = process.cwd()): number | undefined {
  // 1. Check Dockerfile (or dockerfile) for EXPOSE, ENV PORT, or CMD port flags
  const dockerfilePath = findDockerfile(cwd);
  let dockerfilePort: number | undefined;

  if (dockerfilePath) {
    try {
      const content = readFileSync(dockerfilePath, "utf8");

      // Check ENV PORT=4000 or ENV PORT 4000
      const envPortMatch = content.match(/^\s*ENV\s+PORT[=\s]+["']?(\d+)["']?/im);
      if (envPortMatch && envPortMatch[1]) {
        dockerfilePort = parsePortNumber(envPortMatch[1]);
      }

      // Check EXPOSE 4000 (or EXPOSE 4000/tcp)
      if (!dockerfilePort) {
        const exposeMatch = content.match(/^\s*EXPOSE\s+(\d+)/im);
        if (exposeMatch && exposeMatch[1]) {
          dockerfilePort = parsePortNumber(exposeMatch[1]);
        }
      }

      // Check CMD / ENTRYPOINT in Dockerfile
      if (!dockerfilePort) {
        const cmdMatch = content.match(/^\s*(?:CMD|ENTRYPOINT)\s+(.+)$/im);
        if (cmdMatch && cmdMatch[1]) {
          dockerfilePort = extractPortFromCommand(cmdMatch[1]);
        }
      }
    } catch {
      // Ignore read error
    }
  }

  // 2. Check package.json scripts (start, serve, dev)
  let packagePort: number | undefined;
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const scripts = pkg.scripts || {};

      if (typeof scripts.start === "string") {
        packagePort = extractPortFromCommand(scripts.start);
      }
      if (!packagePort && typeof scripts.serve === "string") {
        packagePort = extractPortFromCommand(scripts.serve);
      }
      if (!packagePort && typeof scripts.dev === "string") {
        packagePort = extractPortFromCommand(scripts.dev);
      }
    } catch {
      // Ignore parse error
    }
  }

  // If package.json explicitly overrides start with a custom port (not 3000), prioritize it,
  // or return the Dockerfile port, or whatever was found.
  if (packagePort && packagePort !== 3000) {
    return packagePort;
  }
  if (dockerfilePort && dockerfilePort !== 3000) {
    return dockerfilePort;
  }

  return dockerfilePort || packagePort;
}

export function detectProjectName(cwd: string = process.cwd()): string {
  let name = basename(resolve(cwd));
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (typeof pkg.name === "string" && pkg.name.trim()) {
        name = pkg.name.trim();
      }
    } catch {
      // Ignore parse error
    }
  }
  return name;
}
