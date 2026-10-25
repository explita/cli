import type { Deployment } from "../types.js";
import { api, wsUrl, wsOptions } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printLogsHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Logs`,
    desc: "View application deployment and runtime logs",
    commands: [
      ["eda logs [-a <appId>]", "View deployment/build logs"],
      [
        "eda logs [-a <appId>] --live",
        "Stream live runtime container logs (docker logs -f)",
      ],
      [
        "eda logs [-a <appId>] --tail <lines>",
        "Print the last N lines of runtime container logs",
      ],
      [
        "eda logs [-a <appId>] --live --tail <N>",
        "Stream live runtime logs starting from last N lines",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from config)",
      ],
      ["-l, --live", "Stream live runtime logs in real-time over WebSocket"],
      [
        "-t, --tail <lines>",
        "Number of lines to show from runtime logs (default: 50 for snapshot, 100 for live)",
      ],
      [
        "--deploy",
        "Explicitly view build/deployment logs instead of runtime logs",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

async function streamRuntimeLogs(appId: string, tail?: string): Promise<void> {
  const query = new URLSearchParams();
  if (tail) query.set("tail", tail);
  query.set("follow", "true");

  const path = `/api/apps/${encodeURIComponent(appId)}/runtime-logs?${query.toString()}`;
  const url = wsUrl(path);

  return new Promise<void>((resolvePromise, rejectPromise) => {
    let resolved = false;
    const finish = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      if (err) rejectPromise(err);
      else resolvePromise();
    };

    const WS = (globalThis as any).WebSocket;
    if (typeof WS !== "function") {
      finish(new Error("WebSocket is not supported in this Node environment."));
      return;
    }

    process.stdout.write(
      `\nConnecting to runtime log stream for app ${colors.cyan(appId)}...\n`,
    );

    const socket = new WS(url, wsOptions());
    let isConnected = false;

    socket.onopen = () => {
      isConnected = true;
      process.stdout.write(
        `${colors.dim("(Connected. Press Ctrl+C to stop streaming)\n\n")}`,
      );
    };

    socket.onmessage = (event: any) => {
      process.stdout.write(event.data);
    };

    socket.onerror = (event: any) => {
      if (!isConnected) {
        const msg =
          event?.message || "Could not connect to deploy server WebSocket";
        finish(new Error(`Failed to stream runtime logs: ${msg}`));
      }
    };

    socket.onclose = (event: any) => {
      if (event?.reason) {
        process.stdout.write(
          `\n${colors.dim(`[Stream closed: ${event.reason}]`)}\n`,
        );
      }
      finish();
    };

    const cleanup = () => {
      try {
        socket.close();
      } catch {}
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
}

async function printRuntimeLogsSnapshot(
  appId: string,
  tail: string,
): Promise<void> {
  const res = await api<{
    appId: string;
    containerName: string;
    tail: string;
    logs: string[];
  }>(
    `/api/apps/${encodeURIComponent(appId)}/runtime-logs?tail=${encodeURIComponent(tail)}`,
  );

  if (!res.logs?.length) {
    console.log(
      `\nNo runtime logs found for application ${colors.cyan(appId)}.\n`,
    );
    return;
  }

  console.log(
    `\n${colors.bold(`Runtime logs for ${colors.cyan(appId)}`)} (last ${res.logs.length} lines):\n`,
  );
  for (const line of res.logs) {
    process.stdout.write(`${line}\n`);
  }
  console.log("");
}

export async function runLogsCommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printLogsHelp();
    return;
  }

  const { appId, values } = parseAppCommand(args, "logs", {
    live: { type: "boolean", short: "l", default: false },
    tail: { type: "string", short: "t" },
    deploy: { type: "boolean", default: false },
  });

  const isLive = Boolean(values.live);
  const tail = values.tail ? String(values.tail) : undefined;
  const isDeployOnly = Boolean(values.deploy);

  // If --live is requested, stream live over WebSocket
  if (isLive) {
    return streamRuntimeLogs(appId, tail);
  }

  // If --tail is requested without --live, print the runtime log snapshot
  if (tail && !isDeployOnly) {
    return printRuntimeLogsSnapshot(appId, tail);
  }

  // Otherwise, display deployment/build logs with a hint about --live
  const deployments = await api<Deployment[]>(
    `/api/apps/${encodeURIComponent(appId)}/deployments`,
  );
  const latest = deployments[0];
  if (!latest) {
    console.log("No deployments yet.");
    return;
  }

  process.stdout.write(`\n[${latest.status}] Deployment ${latest.id}\n`);

  if (latest.logs?.length) {
    process.stdout.write(`${latest.logs.join("\n")}\n`);
  } else {
    console.log("No logs recorded for this deployment.");
  }

  console.log(
    `\n${colors.dim(`Tip: To stream live application runtime logs, run: eda logs -a ${appId} --live`)}\n`,
  );
}
