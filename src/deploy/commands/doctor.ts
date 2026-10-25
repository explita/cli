import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRODUCT_NAME,
  SystemDiagnostics,
  colors,
  formatSize,
  formatUptime,
  loadProjectConfig,
} from "@explita/infra-protocol";
import { api, baseUrl, authToken } from "../lib/api.js";
import { printCmdAndDec } from "../../lib/utils.js";
import { CLI_VERSION } from "../../version.js";
import {
  checkServerVersionUpdate,
  checkCliVersionUpdate,
  UPSTREAM_SETUP_SCRIPT_COMMAND,
} from "../lib/version-check.js";
import { findDockerfile } from "../lib/archive.js";

function printDoctorHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} System Diagnostics`,
    desc: "Run pre-flight connectivity, server health, and local project checks",
    commands: [
      ["eda doctor", "Run full pre-flight system diagnostics and validation"],
    ],
    examples: [
      [
        "eda doctor",
        "Diagnose VPS connectivity, Docker, disk, and local Dockerfile",
      ],
    ],
    options: [["-h, --help", "Show help"]],
  });
}

export async function runDoctorCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    printDoctorHelp();
    return;
  }

  console.log(
    `\n${colors.bold(`${PRODUCT_NAME.deploy} Pre-Flight Diagnostics`)}\n`,
  );

  let errorCount = 0;
  let warnCount = 0;

  // 1. Connectivity & API Auth
  console.log(colors.bold("1. Remote Connectivity & Authentication:"));
  const targetUrl = baseUrl();
  const token = authToken();

  if (!token) {
    console.log(
      `  ${colors.red("✖")} API Token: Not configured. Run 'eda config set token <token>'`,
    );
    errorCount++;
  }

  let diag: SystemDiagnostics | null = null;
  const startTime = Date.now();

  try {
    const res = await api<SystemDiagnostics>("/api/system/doctor");
    const latency = Date.now() - startTime;
    diag = res;

    console.log(
      `  ${colors.green("✔")} Server URL:   ${colors.cyan(targetUrl)}`,
    );
    console.log(
      `  ${colors.green("✔")} API Latency:  ${colors.bold(`${latency} ms`)}`,
    );
    console.log(`  ${colors.green("✔")} Authentication: Token valid`);
  } catch (err: any) {
    const latency = Date.now() - startTime;
    console.log(
      `  ${colors.red("✖")} Connection failed to ${colors.cyan(targetUrl)} (${latency} ms): ${err?.message || err}`,
    );
    errorCount++;
  }
  console.log();

  // 2. Server & VPS Health
  console.log(colors.bold("2. Remote Server & Docker Health:"));
  if (diag) {
    // Host system
    if (diag.server) {
      const osInfo = `${diag.server.platform}/${diag.server.arch}`;
      const uptime = formatUptime(diag.server.uptimeSeconds);
      const hostDetail = diag.server.hostname
        ? ` (host: ${diag.server.hostname}, uptime: ${uptime})`
        : ` (uptime: ${uptime})`;
      console.log(
        `  ${colors.green("✔")} Host System:   ${osInfo}${hostDetail}`,
      );
    }

    // Docker daemon
    if (diag.docker.available) {
      console.log(
        `  ${colors.green("✔")} Docker Daemon: v${diag.docker.version || "unknown"} (running, ${diag.docker.containersRunning} active container${diag.docker.containersRunning === 1 ? "" : "s"})`,
      );
    } else {
      console.log(
        `  ${colors.red("✖")} Docker Daemon: Unavailable (${diag.docker.error || "Not responding"})`,
      );
      errorCount++;
    }

    // Disk space
    const disk = diag.disk;
    if (disk.totalBytes > 0) {
      const diskMsg = `${formatSize(disk.freeBytes)} free of ${formatSize(disk.totalBytes)} (${disk.usedPercent}% used)`;
      if (disk.usedPercent > 90) {
        console.log(
          `  ${colors.red("✖")} Disk Space:    ${diskMsg} - CRITICAL: Run 'eda prune' to free up space`,
        );
        errorCount++;
      } else if (disk.usedPercent > 80) {
        console.log(
          `  ${colors.yellow("⚠")} Disk Space:    ${diskMsg} - WARNING: Approaching capacity`,
        );
        warnCount++;
      } else {
        console.log(`  ${colors.green("✔")} Disk Space:    ${diskMsg}`);
      }
    } else {
      console.log(`  ${colors.dim("•")} Disk Space:    Metrics unavailable`);
    }

    // Memory headroom
    const mem = diag.memory;
    if (mem.totalBytes > 0) {
      const memMsg = `${formatSize(mem.freeBytes)} free of ${formatSize(mem.totalBytes)} (${mem.usedPercent}% used)`;
      if (mem.usedPercent > 95) {
        console.log(
          `  ${colors.yellow("⚠")} Memory:        ${memMsg} - High host memory load`,
        );
        warnCount++;
      } else {
        console.log(`  ${colors.green("✔")} Memory:        ${memMsg}`);
      }
    }

    // Caddy reverse proxy
    if (diag.caddy.running) {
      console.log(
        `  ${colors.green("✔")} Reverse Proxy: ${diag.caddy.container} (Caddy is running & routing traffic)`,
      );
    } else {
      console.log(
        `  ${colors.yellow("⚠")} Reverse Proxy: ${diag.caddy.container} (${diag.caddy.status})`,
      );
      warnCount++;
    }

    // Version & Upgrades
    const serverVer = diag.server?.version;
    if (serverVer) {
      const updateCheck = await checkServerVersionUpdate(serverVer, {
        force: true,
      });
      if (updateCheck.hasUpdate) {
        console.log(
          `  ${colors.yellow("⚠")} Server Version: v${serverVer} — ${colors.bold(colors.yellow(`Update available: v${updateCheck.latestVersion}`))}`,
        );
        console.log(
          `      ${colors.dim("To upgrade your remote VPS, SSH in and run:")}\n      ${colors.cyan(UPSTREAM_SETUP_SCRIPT_COMMAND)}`,
        );
        warnCount++;
      } else {
        console.log(
          `  ${colors.green("✔")} Server Version: v${serverVer} (up to date)`,
        );
      }
    }

    const cliUpdate = await checkCliVersionUpdate(CLI_VERSION);
    if (cliUpdate.hasUpdate) {
      console.log(
        `  ${colors.yellow("⚠")} CLI Version:    v${CLI_VERSION} — ${colors.bold(colors.yellow(`Update available: v${cliUpdate.latestVersion}`))}`,
      );
      console.log(
        `      ${colors.dim("To upgrade local CLI, run:")} ${colors.cyan("npm i -g @explita/cli")}`,
      );
      warnCount++;
    } else {
      console.log(
        `  ${colors.green("✔")} CLI Version:    v${CLI_VERSION} (up to date)`,
      );
    }
  } else {
    console.log(
      `  ${colors.dim("•")} Skipped server metrics (remote server unreachable)`,
    );
  }
  console.log();

  // 3. Local Project Validation
  console.log(colors.bold("3. Local Project Configuration:"));
  const cwd = process.cwd();

  // Check explita.json
  const projectConfig = loadProjectConfig(cwd);
  let localPort: number | undefined;

  if (projectConfig?.config?.deploy) {
    const deploy = projectConfig.config.deploy;
    localPort = deploy.port;
    const nameValid =
      typeof deploy.name === "string" && deploy.name.trim().length > 0;
    const portValid =
      typeof deploy.port === "number" &&
      deploy.port > 0 &&
      deploy.port <= 65535;

    if (nameValid && portValid) {
      console.log(
        `  ${colors.green("✔")} explita.json:  Valid config (App: "${colors.bold(deploy.name ?? "")}", Port: ${colors.bold(String(deploy.port))})`,
      );
    } else {
      console.log(
        `  ${colors.yellow("⚠")} explita.json:  Missing valid name or port in deploy section`,
      );
      warnCount++;
    }

    if (deploy.healthCheck) {
      if (
        typeof deploy.healthCheck === "string" &&
        !deploy.healthCheck.startsWith("/")
      ) {
        console.log(
          `  ${colors.yellow("⚠")} healthCheck:   "${deploy.healthCheck}" should start with leading slash (e.g. "/${deploy.healthCheck}")`,
        );
        warnCount++;
      }
    }
  } else {
    console.log(
      `  ${colors.dim("•")} explita.json:  No local deploy config found (run 'eda init' to create)`,
    );
  }

  // Check Dockerfile
  const dockerfilePath = findDockerfile(cwd);
  if (dockerfilePath) {
    try {
      const dockerfileContent = readFileSync(dockerfilePath, "utf8");
      const lines = dockerfileContent.split("\n");
      const hasFrom = lines.some((l) =>
        l.trim().toUpperCase().startsWith("FROM"),
      );
      const exposeLine = lines.find((l) =>
        l.trim().toUpperCase().startsWith("EXPOSE"),
      );
      const hasCmd = lines.some((l) => {
        const trimmed = l.trim().toUpperCase();
        return trimmed.startsWith("CMD") || trimmed.startsWith("ENTRYPOINT");
      });

      if (!hasFrom) {
        console.log(
          `  ${colors.red("✖")} Dockerfile:    Invalid syntax: Missing required FROM instruction`,
        );
        errorCount++;
      } else {
        console.log(
          `  ${colors.green("✔")} Dockerfile:    Present & valid syntax`,
        );
      }

      if (exposeLine) {
        const match = exposeLine.match(/EXPOSE\s+(\d+)/i);
        if (match && match[1]) {
          const exposedPort = parseInt(match[1], 10);
          if (localPort && localPort !== exposedPort) {
            console.log(
              `  ${colors.yellow("⚠")} Port Mismatch: Dockerfile EXPOSES port ${exposedPort}, but explita.json specifies port ${localPort}`,
            );
            warnCount++;
          } else {
            console.log(
              `  ${colors.green("✔")} Port Exposure: EXPOSE ${exposedPort} aligns with configuration`,
            );
          }
        }
      }

      if (!hasCmd) {
        console.log(
          `  ${colors.yellow("⚠")} Entrypoint:    No CMD or ENTRYPOINT found in Dockerfile`,
        );
        warnCount++;
      }
    } catch (err: any) {
      console.log(
        `  ${colors.red("✖")} Dockerfile:    Error reading file: ${err?.message || err}`,
      );
      errorCount++;
    }
  } else {
    if (existsSync(join(cwd, "package.json"))) {
      console.log(
        `  ${colors.yellow("⚠")} Dockerfile:    No Dockerfile found in current directory. Add a Dockerfile to build your app.`,
      );
      warnCount++;
    } else {
      console.log(
        `  ${colors.dim("•")} Dockerfile:    No Dockerfile in current directory`,
      );
    }
  }

  // Check .dockerignore
  const dockerignorePath = join(cwd, ".dockerignore");
  if (existsSync(dockerignorePath)) {
    const ignoreContent = readFileSync(dockerignorePath, "utf8");
    const ignoresNodeModules = ignoreContent.includes("node_modules");
    const ignoresGit = ignoreContent.includes(".git");

    if (ignoresNodeModules && ignoresGit) {
      console.log(
        `  ${colors.green("✔")} .dockerignore: Present (node_modules and .git excluded)`,
      );
    } else {
      console.log(
        `  ${colors.yellow("⚠")} .dockerignore: Should include both 'node_modules' and '.git' to optimize upload speed`,
      );
      warnCount++;
    }

    if (ignoreContent.match(/Dockerfile/i)) {
      console.log(
        `  ${colors.yellow("⚠")} .dockerignore: Contains 'Dockerfile' pattern. Explita Deploy automatically includes it so remote builds succeed`,
      );
    }
  } else if (dockerfilePath && existsSync(dockerfilePath)) {
    console.log(
      `  ${colors.yellow("⚠")} .dockerignore: Missing. Recommended to avoid uploading unnecessary files`,
    );
    warnCount++;
  }

  console.log();

  // Final summary
  if (errorCount === 0 && warnCount === 0) {
    console.log(
      `${colors.green("✔ All diagnostics passed!")} System and project are ready to deploy.\n`,
    );
  } else if (errorCount === 0) {
    console.log(
      `${colors.yellow(`⚠ Diagnostics passed with ${warnCount} warning${warnCount === 1 ? "" : "s"}.`)} Ready to deploy, but check the recommendations above.\n`,
    );
  } else {
    console.log(
      `${colors.red(`✖ Found ${errorCount} issue${errorCount === 1 ? "" : "s"}`)}${warnCount > 0 ? ` and ${warnCount} warning(s)` : ""}. Please resolve them before deploying.\n`,
    );
    throw new Error(`Diagnostics failed with ${errorCount} issue(s).`);
  }
}
