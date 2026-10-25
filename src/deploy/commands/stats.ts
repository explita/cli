import { api, wsUrl, wsOptions } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import type {
  ContainerStat,
  AppStatsResponse,
  SystemStatsResponse,
} from "@explita/infra-protocol/deploy";

function printStatsHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Stats & Top`,
    desc: "Inspect container resource utilization",
    commands: [
      [
        "eda stats [-a <appId>] [--all] [-l, --live]",
        "Snapshot resource metrics for app or cluster",
      ],
      [
        "eda top [-a <appId>] [--all]",
        "Live updating terminal resource dashboard",
      ],
    ],
    examples: [
      ["eda stats", "Show resource usage snapshot for current project"],
      [
        "eda stats -a my-app",
        "Show resource usage snapshot for specific application",
      ],
      [
        "eda stats --all",
        "Show resource usage snapshot for all Explita containers",
      ],
      ["eda stats --live", "Live resource dashboard for current project"],
      ["eda top", "Live updating terminal dashboard (alias for stats --live)"],
      ["eda top --all", "Live updating dashboard for all Explita containers"],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from config)",
      ],
      ["-A, --all", "Inspect all Explita containers across the system"],
      ["-l, --live", "Continuously stream live resource metrics"],
      ["-h, --help", "Show help"],
    ],
  });
}

function colorizePercent(percStr: string, isCpu = false): string {
  const num = parseFloat(percStr.replace("%", "").trim());
  if (isNaN(num)) return percStr;

  if (isCpu) {
    if (num >= 80) return colors.red(percStr);
    if (num >= 50) return colors.yellow(percStr);
    return colors.green(percStr);
  }

  // Memory
  if (num >= 85) return colors.red(percStr);
  if (num >= 70) return colors.yellow(percStr);
  return colors.green(percStr);
}

function colorizeRole(role: string): string {
  switch (role) {
    case "app":
      return colors.green(role);
    case "tunnel":
      return colors.magenta(role);
    case "service":
      return colors.cyan(role);
    default:
      return colors.dim(role);
  }
}

export function formatStatsTable(stats: ContainerStat[]): string {
  if (stats.length === 0) {
    return colors.dim("Collecting container metrics...");
  }

  // Sort containers: app first, then tunnel, then services
  const rolePriority: Record<string, number> = {
    app: 1,
    tunnel: 2,
    service: 3,
  };
  const sorted = [...stats].sort((a, b) => {
    const pA = rolePriority[a.role] ?? 99;
    const pB = rolePriority[b.role] ?? 99;
    if (pA !== pB) return pA - pB;
    return a.name.localeCompare(b.name);
  });

  const nameWidth = Math.max(14, ...sorted.map((s) => s.name.length));
  const roleWidth = Math.max(6, ...sorted.map((s) => s.role.length));
  const cpuWidth = Math.max(7, ...sorted.map((s) => s.cpuPerc.length));
  const memUsageWidth = Math.max(19, ...sorted.map((s) => s.memUsage.length));
  const memPercWidth = Math.max(7, ...sorted.map((s) => s.memPerc.length));
  const netWidth = Math.max(15, ...sorted.map((s) => s.netIO.length));
  const blockWidth = Math.max(13, ...sorted.map((s) => s.blockIO.length));
  const pidsWidth = Math.max(6, ...sorted.map((s) => s.pids.length));

  const header = [
    "CONTAINER".padEnd(nameWidth),
    "ROLE".padEnd(roleWidth),
    "CPU %".padStart(cpuWidth),
    "MEM USAGE / LIMIT".padEnd(memUsageWidth),
    "MEM %".padStart(memPercWidth),
    "NET I/O".padEnd(netWidth),
    "BLOCK I/O".padEnd(blockWidth),
    "PIDS".padStart(pidsWidth),
  ].join("  ");

  const dividerLength =
    nameWidth +
    roleWidth +
    cpuWidth +
    memUsageWidth +
    memPercWidth +
    netWidth +
    blockWidth +
    pidsWidth +
    14; // 7 gaps of 2 spaces

  const divider = colors.dim("─".repeat(dividerLength));

  const rows = sorted.map((s) => {
    const rawRole = s.role.padEnd(roleWidth);
    const coloredRole = colorizeRole(rawRole);

    const rawCpu = s.cpuPerc.padStart(cpuWidth);
    const coloredCpu = colorizePercent(rawCpu, true);

    const rawMemPerc = s.memPerc.padStart(memPercWidth);
    const coloredMemPerc = colorizePercent(rawMemPerc, false);

    return [
      colors.bold(s.name.padEnd(nameWidth)),
      coloredRole,
      coloredCpu,
      s.memUsage.padEnd(memUsageWidth),
      coloredMemPerc,
      s.netIO.padEnd(netWidth),
      s.blockIO.padEnd(blockWidth),
      s.pids.padStart(pidsWidth),
    ].join("  ");
  });

  return [colors.dim(header), divider, ...rows].join("\n");
}

export async function runStatsCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    printStatsHelp();
    return;
  }

  const { appId, values } = parseAppCommand(
    args,
    "stats",
    {
      all: { type: "boolean", short: "A" },
      live: { type: "boolean", short: "l" },
    },
    { optional: true },
  );

  const isAll = Boolean(values.all);
  const targetAppId = isAll ? undefined : appId;
  const isLive = Boolean(values.live);

  if (isLive) {
    await runLiveStats({ targetAppId, isAll });
  } else {
    await runSnapshotStats({ targetAppId, isAll });
  }
}

async function runSnapshotStats({
  targetAppId,
  isAll,
}: {
  targetAppId?: string;
  isAll: boolean;
}): Promise<void> {
  if (isAll || !targetAppId) {
    const res = await api<SystemStatsResponse>("/api/system/stats");
    console.log(`\n${colors.bold(PRODUCT_NAME.deploy)} Stats`);
    console.log(
      `${colors.bold("System Resource Snapshot")} ${colors.dim(`(${res.stats.length} running containers)`)}\n`,
    );
    console.log(formatStatsTable(res.stats));
    console.log("");
    return;
  }

  const res = await api<AppStatsResponse>(
    `/api/apps/${encodeURIComponent(targetAppId)}/stats`,
  );
  console.log(
    `\n${colors.bold(res.app.name)} [${colors.cyan(res.app.id)}] ${colors.dim("•")} Status: ${colors.green(res.app.status)}\n`,
  );
  console.log(formatStatsTable(res.stats));
  console.log("");
}

async function runLiveStats({
  targetAppId,
  isAll,
}: {
  targetAppId?: string;
  isAll: boolean;
}): Promise<void> {
  const WS = (globalThis as any).WebSocket;
  if (typeof WS !== "function") {
    throw new Error("WebSocket is not supported in this Node environment.");
  }

  const endpoint =
    isAll || !targetAppId
      ? "/api/system/stats"
      : `/api/apps/${encodeURIComponent(targetAppId)}/stats`;

  const url = wsUrl(endpoint);
  const title =
    isAll || !targetAppId ? "System Containers" : `Application ${targetAppId}`;

  const statsMap = new Map<string, ContainerStat>();
  const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);

  return new Promise<void>((resolve, reject) => {
    let socket: any;
    let isTerminating = false;

    const cleanup = () => {
      if (isTerminating) return;
      isTerminating = true;

      if (isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch {}
        process.stdin.pause();
        process.stdout.write("\x1b[?25h\n"); // restore cursor
      }

      if (socket && socket.readyState === socket.OPEN) {
        try {
          socket.close();
        } catch {}
      }
    };

    const render = () => {
      const statsList = Array.from(statsMap.values());
      const now = new Date().toLocaleTimeString();
      const headerLine = `${colors.bold(`${PRODUCT_NAME.deploy} Top`)}  ${colors.dim("•")}  ${colors.cyan(title)}  ${colors.dim(`[Press ${colors.bold("q")} or ${colors.bold("Ctrl+C")} to quit]`)}  ${colors.dim(now)}`;
      const tableStr = formatStatsTable(statsList);

      const content = `\n${headerLine}\n\n${tableStr}\n`;

      if (isTTY) {
        process.stdout.write("\x1b[H\x1b[J" + content);
      } else {
        process.stdout.write(content);
      }
    };

    if (isTTY) {
      process.stdout.write("\x1b[?25l"); // hide cursor
      try {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (key: string) => {
          if (key === "q" || key === "Q" || key === "\u0003") {
            cleanup();
            resolve();
          }
        });
      } catch {}
    }

    process.on("SIGINT", () => {
      cleanup();
      resolve();
    });

    try {
      socket = new WS(url, wsOptions());
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    socket.onopen = () => {
      render();
    };

    socket.onmessage = (event: any) => {
      try {
        const payload = JSON.parse(
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data),
        );

        if (payload.type === "stat" && payload.data) {
          const item = payload.data as ContainerStat;
          statsMap.set(item.name || item.container, item);
          render();
        } else if (payload.type === "error") {
          cleanup();
          reject(new Error(payload.error || "Live stats error received"));
        }
      } catch {}
    };

    socket.onerror = (err: any) => {
      cleanup();
      reject(
        new Error(
          `Live stats connection error: ${err.message || "Failed to connect to stats endpoint"}`,
        ),
      );
    };

    socket.onclose = (event: any) => {
      cleanup();
      if (
        event &&
        event.code &&
        event.code !== 1000 &&
        event.code !== 1005 &&
        event.reason
      ) {
        reject(
          new Error(
            `Live stats closed by server: ${event.reason} (${event.code})`,
          ),
        );
      } else {
        resolve();
      }
    };
  });
}
