import { Readable } from "node:stream";
import readline from "node:readline";
import { colors } from "@explita/infra-protocol";
import { api, apiRaw } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";

export async function runLifecycleCommand(
  action: "start" | "stop" | "restart",
  args: string[],
): Promise<void> {
  const { appId, values } = parseAppCommand(args, action, {
    recreate: { type: "boolean", short: "r" },
  });

  if (action === "restart" && values.recreate) {
    const response = await apiRaw(
      `/api/apps/${encodeURIComponent(appId)}/restart?recreate=true`,
      {
        method: "POST",
        headers: { accept: "application/x-ndjson" },
      },
    );

    if (
      !response.ok &&
      !response.headers.get("content-type")?.includes("application/x-ndjson")
    ) {
      const err = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      throw new Error(
        err.error || `Request failed with status ${response.status}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body received from server");
    }

    const stream = Readable.fromWeb(response.body as any);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let hasLoggedHeader = false;
    let appName = appId;

    for await (const line of rl) {
      if (!line.trim()) continue;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "log") {
        if (!hasLoggedHeader) {
          console.log(`\n${colors.cyan("ℹ")} Recreating container...`);
          hasLoggedHeader = true;
        }
        console.log(`  ${colors.dim("→")} ${event.line}`);
      } else if (event.type === "done") {
        if (event.data?.name) {
          appName = event.data.name;
        }
      } else if (event.type === "error") {
        console.log(`\n${colors.red("✖")} ${event.error}\n`);
        throw new Error(event.error);
      }
    }

    console.log(
      `\n${colors.green("✔")} Application ${colors.bold(appName)} recreated & restarted.\n`,
    );
    return;
  }

  const result = await api<{ name?: string; state?: string }>(
    `/api/apps/${encodeURIComponent(appId)}/${action}`,
    { method: "POST" },
  );

  const pastTense =
    action === "start"
      ? "started"
      : action === "stop"
        ? "stopped"
        : "restarted";

  console.log(
    `${colors.green("✔")} Application ${colors.bold(result?.name || appId)} ${pastTense}.`,
  );
}
