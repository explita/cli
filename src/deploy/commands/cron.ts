import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import type {
  AppCronInfo,
  CronExecutionRecord,
} from "@explita/infra-protocol/deploy";

function printCronHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Cron`,
    desc: "Scheduled background jobs",
    usage: "explita deploy cron <command> [options]",
    commands: [
      ["ls [-a <appId>]", "List scheduled background jobs (cron)"],
      [
        "run <job> [-a <appId>]",
        "Manually trigger immediate execution of a cron job",
      ],
      ["pause <job> [-a <appId>]", "Pause automated execution of a cron job"],
      [
        "resume <job> [-a <appId>]",
        "Resume automated execution of a paused cron job",
      ],
      ["history [-a <appId>]", "View recent job execution history and output"],
    ],
    examples: [
      ["eda cron ls", "List all scheduled cron jobs"],
      ["eda cron run sync-data", "Trigger immediate run of sync-data"],
      ["eda cron pause sync-data", "Pause automated schedule"],
      ["eda cron resume sync-data", "Resume paused schedule"],
      ["eda cron history", "View recent cron execution logs"],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from explita.json)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const diffMs = date.getTime() - Date.now();
  const absDiffSec = Math.round(Math.abs(diffMs) / 1000);

  if (diffMs > 0) {
    // Future (next run)
    if (absDiffSec < 60) return `in ${absDiffSec}s`;
    const mins = Math.floor(absDiffSec / 60);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return `in ${hours}h ${remMins}m`;
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  } else {
    // Past (last run)
    if (absDiffSec < 60) return `${absDiffSec}s ago`;
    const mins = Math.floor(absDiffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}

export async function runCronCommand(args: string[]): Promise<void> {
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case "ls": {
      const { appId } = parseAppCommand(args.slice(1), "cron ls");

      const crons = await api<AppCronInfo[]>(
        `/api/apps/${encodeURIComponent(appId)}/crons`,
      );

      if (!crons || crons.length === 0) {
        console.log(
          `\n${colors.dim("ℹ")} No scheduled background jobs (cron) configured for application "${colors.cyan(appId)}".`,
        );
        console.log(
          `${colors.dim("  Tip: Add them to explita.json:")}\n` +
            colors.cyan(
              `  crons: [\n    { schedule: "0 2 * * *", command: "npm run cleanup" }\n  ]\n`,
            ),
        );
        return;
      }

      console.log(
        `\n${colors.bold("Scheduled Background Jobs")} for ${colors.cyan(appId)}:\n`,
      );

      console.table(
        crons.map((c) => {
          let statusDisplay = "-";
          if (c.paused) {
            statusDisplay = "⏸ paused";
          } else if (c.lastStatus === "running") {
            statusDisplay = "⏳ running";
          } else if (c.lastStatus === "success") {
            statusDisplay = `✔ success (${c.lastDurationMs ?? 0}ms)`;
          } else if (c.lastStatus === "failed") {
            statusDisplay = `✖ failed (${c.lastDurationMs ?? 0}ms)`;
          }

          return {
            ID: c.id,
            Job: c.name,
            Schedule: c.schedule,
            Description: c.description || "-",
            Command: c.command,
            "Next Run": c.paused ? "(paused)" : formatRelativeTime(c.nextRun),
            "Last Run": formatRelativeTime(c.lastRun),
            Status: statusDisplay,
          };
        }),
      );
      console.log(
        `${colors.dim(`Total: ${crons.length} scheduled job(s). Run manually with 'eda cron run <name|id|index>'.`)}\n`,
      );
      break;
    }

    case "run": {
      const { appId, positionals } = parseAppCommand(args.slice(1), "cron run");

      const jobSelector = positionals[0]?.trim();
      if (!jobSelector) {
        throw new Error(
          "Usage: explita deploy cron run <job> [-a <appId>]\nExample: eda cron run sync-data",
        );
      }

      console.log(
        `\n${colors.cyan("⏳")} Triggering cron job "${colors.bold(jobSelector)}" on ${colors.cyan(appId)}...`,
      );

      const record = await api<CronExecutionRecord>(
        `/api/apps/${encodeURIComponent(appId)}/crons/run`,
        {
          method: "POST",
          body: JSON.stringify({ job: jobSelector }),
        },
      );

      if (record.status === "success") {
        console.log(
          `\n${colors.green("✔")} Job ${colors.bold(record.cronName)} completed successfully in ${colors.bold(String(record.durationMs || 0))}ms (exit code 0).\n`,
        );
      } else {
        console.log(
          `\n${colors.red("✖")} Job ${colors.bold(record.cronName)} failed in ${colors.bold(String(record.durationMs || 0))}ms (exit code ${record.exitCode ?? 1}).\n`,
        );
      }

      if (record.output) {
        console.log(colors.bold("Output:"));
        console.log(colors.dim(record.output));
        console.log("");
      }
      break;
    }

    case "pause": {
      const { appId, positionals } = parseAppCommand(
        args.slice(1),
        "cron pause",
      );

      const jobSelector = positionals[0]?.trim();
      if (!jobSelector) {
        throw new Error(
          "Usage: explita deploy cron pause <job> [-a <appId>]\nExample: eda cron pause sync-data",
        );
      }

      const job = await api<any>(
        `/api/apps/${encodeURIComponent(appId)}/crons/pause`,
        {
          method: "POST",
          body: JSON.stringify({ job: jobSelector }),
        },
      );

      console.log(
        `\n${colors.yellow("⏸")} Paused scheduled execution for cron job "${colors.bold(job?.name || job?.id || jobSelector)}" on ${colors.cyan(appId)}.\n`,
      );
      break;
    }

    case "resume": {
      const { appId, positionals } = parseAppCommand(
        args.slice(1),
        "cron resume",
      );

      const jobSelector = positionals[0]?.trim();
      if (!jobSelector) {
        throw new Error(
          "Usage: explita deploy cron resume <job> [-a <appId>]\nExample: eda cron resume sync-data",
        );
      }

      const job = await api<any>(
        `/api/apps/${encodeURIComponent(appId)}/crons/resume`,
        {
          method: "POST",
          body: JSON.stringify({ job: jobSelector }),
        },
      );

      console.log(
        `\n${colors.green("▶")} Resumed scheduled execution for cron job "${colors.bold(job?.name || job?.id || jobSelector)}" on ${colors.cyan(appId)}.\n`,
      );
      break;
    }

    case "history": {
      const { appId } = parseAppCommand(args.slice(1), "cron history");

      const history = await api<CronExecutionRecord[]>(
        `/api/apps/${encodeURIComponent(appId)}/crons/history`,
      );

      if (!history || history.length === 0) {
        console.log(
          `\n${colors.dim("ℹ")} No cron execution history found for application "${colors.cyan(appId)}".`,
        );
        return;
      }

      console.log(
        `\n${colors.bold("Cron Execution History")} for ${colors.cyan(appId)}:\n`,
      );

      console.table(
        history.map((h) => ({
          Job: h.cronName,
          Trigger: h.manual ? "manual" : "schedule",
          Status:
            h.status === "success"
              ? "✔ success"
              : h.status === "failed"
                ? "✖ failed"
                : "⏳ running",
          Duration: `${h.durationMs ?? 0}ms`,
          Started: formatRelativeTime(h.startedAt),
          Output:
            h.output.length > 50
              ? `${h.output.slice(0, 47).replace(/\r?\n/g, " ")}...`
              : h.output.replace(/\r?\n/g, " ") || "-",
        })),
      );
      console.log("");
      break;
    }

    default:
      printCronHelp();
      if (subCommand && subCommand !== "--help" && subCommand !== "-h") {
        throw new Error(`Unknown cron subcommand: ${subCommand}`);
      }
      break;
  }
}
