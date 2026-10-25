import { stdin as input } from "node:process";
import { api } from "../lib/api.js";
import { askConfirm } from "../../lib/prompt.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import {
  DatabaseBackupFile,
  DatabaseBackupSchedule,
  describeCron,
} from "@explita/infra-protocol/deploy";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printBackupHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Database Backups`,
    desc: "Automated database backup schedules and retention",
    commands: [
      [
        "eda db backup schedule [-a <appId>] [-k <key>] [options]",
        "Configure or view automated backup schedule",
      ],
      [
        "eda db backup ls [-a <appId>] [-k <key>]",
        "List available database backups",
      ],
      [
        "eda db backup create [-a <appId>] [-k <key>] [--s3]",
        "Take an immediate backup snapshot on server",
      ],
      [
        "eda db backup restore [-a <appId>] <backupId> [-k <key>] [-y]",
        "Restore database from server backup archive",
      ],
      [
        "eda db backup rm [-a <appId>] <backupId>",
        "Delete a database backup from server",
      ],
    ],
    options: [
      ["-k, --key <key>", "Database key identifier (default: default)"],
      ["--daily", "Run backup every day at 02:00 UTC (0 2 * * *)"],
      ["--hourly", "Run backup every hour at minute 0 (0 * * * *)"],
      ["--weekly", "Run backup every Sunday at 02:00 UTC (0 2 * * 0)"],
      [
        "--cron <expression>",
        'Custom 5-part cron expression (e.g. "0 4 * * *")',
      ],
      [
        "--keep <count>",
        "Number of backups to keep (rolling retention, default: 7)",
      ],
      ["--s3", "Enable off-site S3 replication (or --no-s3 to disable)"],
      ["-f, --force", "Force backup even if database content has not changed"],
      ["--disable", "Disable automated backup schedule"],
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from explita.json)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runDbBackupCommand(args: string[]): Promise<void> {
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case "--help":
    case "-h":
    case undefined: {
      printBackupHelp();
      return;
    }

    case "schedule": {
      await runSchedule(args.slice(1));
      break;
    }

    case "ls": {
      await runList(args.slice(1));
      break;
    }

    case "create":
    case "now": {
      await runCreate(args.slice(1));
      break;
    }

    case "restore": {
      await runRestore(args.slice(1));
      break;
    }

    case "rm": {
      await runDelete(args.slice(1));
      break;
    }

    default: {
      printBackupHelp();
      throw new Error(
        `Unknown backup command: "${subCommand}". Use "schedule", "ls", "create", "restore", or "rm".`,
      );
    }
  }
}

async function runSchedule(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "db backup schedule", {
    key: { type: "string", short: "k" },
    daily: { type: "boolean" },
    hourly: { type: "boolean" },
    weekly: { type: "boolean" },
    cron: { type: "string" },
    keep: { type: "string" },
    s3: { type: "boolean" },
    "no-s3": { type: "boolean" },
    disable: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  });

  if (values.help) {
    printBackupHelp();
    return;
  }

  const key = values.key ? String(values.key).trim().toLowerCase() : undefined;
  const keyQuery = key ? `?key=${encodeURIComponent(key)}` : "";

  const hasScheduleInput =
    values.daily ||
    values.hourly ||
    values.weekly ||
    Boolean(values.cron) ||
    values.keep !== undefined ||
    values.s3 !== undefined ||
    values["no-s3"] !== undefined ||
    values.disable !== undefined;

  if (!hasScheduleInput) {
    // View current schedule(s)
    const scheduleData = await api<
      DatabaseBackupSchedule & {
        key?: string;
        dbName?: string;
        all?: Record<string, DatabaseBackupSchedule>;
      }
    >(`/api/apps/${encodeURIComponent(appId)}/db/backup/schedule${keyQuery}`);

    if (!key && scheduleData.all && Object.keys(scheduleData.all).length > 1) {
      console.log(
        `\n${colors.bold("Database Backup Schedules for application")} ${colors.cyan(appId)}:\n`,
      );
      for (const [k, sched] of Object.entries(scheduleData.all)) {
        console.log(`  ${colors.bold(`Database key: "${k}"`)}`);
        console.log(
          `    Status       : ${sched.enabled ? colors.green("Enabled") : colors.dim("Disabled")}`,
        );
        console.log(
          `    Schedule     : ${colors.bold(sched.schedule)} (${colors.cyan(describeCron(sched.schedule))})`,
        );
        console.log(
          `    Retention    : Keep ${colors.bold(String(sched.keep))} latest backups`,
        );
        console.log(
          `    S3 Replic.   : ${sched.s3 ? colors.green("✔ Enabled") : colors.dim("Off (local only)")}`,
        );
        if (sched.lastRunAt) {
          console.log(
            `    Last Run     : ${colors.dim(new Date(sched.lastRunAt).toLocaleString())} (${sched.lastStatus === "success" ? colors.green("success") : colors.red(sched.lastStatus || "unknown")})`,
          );
          if (sched.lastError) {
            console.log(`    Last Error   : ${colors.red(sched.lastError)}`);
          }
        }
        console.log();
      }
      console.log(
        `  ${colors.dim(`Configure: eda db backup schedule -a ${appId} -k <key> --daily --keep 7`)}\n`,
      );
      return;
    }

    const targetKeyLabel = scheduleData.key || key || "default";
    console.log(
      `\n${colors.bold("Database Backup Schedule for application")} ${colors.cyan(appId)} ${colors.dim(`[key: ${targetKeyLabel}]`)}:\n`,
    );
    console.log(
      `  Status       : ${scheduleData.enabled ? colors.green("Enabled") : colors.dim("Disabled")}`,
    );
    console.log(`  Schedule     : ${colors.bold(scheduleData.schedule)}`);
    console.log(
      `  Description  : ${colors.cyan(describeCron(scheduleData.schedule))}`,
    );
    console.log(
      `  Retention    : Keep ${colors.bold(String(scheduleData.keep))} latest backups`,
    );
    console.log(
      `  S3 Replic.   : ${scheduleData.s3 ? colors.green("✔ Enabled") : colors.dim("Off (local only)")}`,
    );
    if (scheduleData.lastRunAt) {
      console.log(
        `  Last Run     : ${colors.dim(new Date(scheduleData.lastRunAt).toLocaleString())}`,
      );
      console.log(
        `  Last Status  : ${scheduleData.lastStatus === "success" ? colors.green("success") : colors.red(scheduleData.lastStatus || "unknown")}`,
      );
      if (scheduleData.lastError) {
        console.log(`  Last Error   : ${colors.red(scheduleData.lastError)}`);
      }
    }
    console.log(
      `\n  ${colors.dim(`Configure: eda db backup schedule -a ${appId}${key ? ` -k ${key}` : ""} --daily --keep 7`)}\n`,
    );
    return;
  }

  // Update schedule
  let cronExpression: string | undefined;
  if (values.daily) cronExpression = "0 2 * * *";
  else if (values.hourly) cronExpression = "0 * * * *";
  else if (values.weekly) cronExpression = "0 2 * * 0";
  else if (values.cron) cronExpression = String(values.cron).trim();

  const keepCount =
    values.keep !== undefined ? parseInt(String(values.keep), 10) : undefined;
  if (keepCount !== undefined && (isNaN(keepCount) || keepCount <= 0)) {
    throw new Error(
      `Invalid --keep value "${values.keep}". Must be a positive integer.`,
    );
  }

  const enabled = values.disable ? false : true;
  const s3Enabled = values.s3 ? true : values["no-s3"] ? false : undefined;

  console.log(
    `Updating database backup schedule for application ${colors.cyan(appId)}${key ? ` (key: "${key}")` : ""}...`,
  );

  const updated = await api<DatabaseBackupSchedule & { key?: string }>(
    `/api/apps/${encodeURIComponent(appId)}/db/backup/schedule`,
    {
      method: "POST",
      body: JSON.stringify({
        key,
        schedule: cronExpression,
        keep: keepCount,
        enabled,
        s3: s3Enabled,
      }),
    },
  );

  console.log(
    `\n${colors.green("✔")} Backup schedule successfully updated for ${colors.cyan(appId)} [key: ${updated.key || key || "default"}]:\n`,
  );
  console.log(
    `  Status      : ${updated.enabled ? colors.green("Enabled") : colors.yellow("Disabled")}`,
  );
  console.log(
    `  Schedule    : ${colors.bold(updated.schedule)} (${colors.cyan(describeCron(updated.schedule))})`,
  );
  console.log(
    `  Retention   : Keep ${colors.bold(String(updated.keep))} latest backups`,
  );
  console.log(
    `  S3 Replic.  : ${updated.s3 ? colors.green("✔ Enabled") : colors.dim("Off (local only)")}\n`,
  );
}

async function runList(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "db backup ls", {
    key: { type: "string", short: "k" },
  });

  const key = values.key ? String(values.key).trim().toLowerCase() : undefined;
  const keyQuery = key ? `?key=${encodeURIComponent(key)}` : "";

  const backups = await api<DatabaseBackupFile[]>(
    `/api/apps/${encodeURIComponent(appId)}/db/backups${keyQuery}`,
  );

  console.log(
    `\n${colors.bold("Database Backups for application")} ${colors.cyan(appId)}${key ? ` (key: ${key})` : ""}:\n`,
  );

  if (!backups || backups.length === 0) {
    console.log(`  ${colors.dim("No backups found.")}`);
    console.log(
      `\n  ${colors.dim(`Take a backup now : eda db backup create -a ${appId}${key ? ` -k ${key}` : ""}`)}`,
    );
    console.log(
      `  ${colors.dim(`Set up schedule   : eda db backup schedule -a ${appId}${key ? ` -k ${key}` : ""} --daily --keep 7`)}\n`,
    );
    return;
  }

  const headers = ["BACKUP ID / FILE", "KEY", "STORAGE", "SIZE", "CREATED"];
  const rows = backups.map((b) => [
    b.filename,
    b.key || "default",
    b.storage === "both" ? "synced (local+s3)" : b.storage || "local",
    b.sizeFormatted,
    new Date(b.createdAt).toLocaleString(),
  ]);

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const headerLine = headers
    .map((h, i) => colors.bold(h.padEnd(colWidths[i])))
    .join("  ");
  console.log(`  ${headerLine}`);
  console.log(`  ${colWidths.map((w) => "─".repeat(w)).join("  ")}`);

  for (const row of rows) {
    const storageColor =
      row[2] === "synced (local+s3)"
        ? colors.green(row[2].padEnd(colWidths[2]))
        : row[2] === "s3"
          ? colors.cyan(row[2].padEnd(colWidths[2]))
          : colors.dim(row[2].padEnd(colWidths[2]));
    console.log(
      `  ${colors.cyan(row[0].padEnd(colWidths[0]))}  ${colors.yellow(row[1].padEnd(colWidths[1]))}  ${storageColor}  ${row[3].padEnd(colWidths[3])}  ${colors.dim(row[4])}`,
    );
  }

  console.log(`\n  ${colors.dim(`Total: ${backups.length} backup(s)`)}`);
  console.log(
    `  ${colors.dim(`Restore with: eda db backup restore -a ${appId} <backupId> [-k <key>]`)}\n`,
  );
}

async function runCreate(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "db backup create", {
    key: { type: "string", short: "k" },
    s3: { type: "boolean" },
    force: { type: "boolean", short: "f" },
  });

  const key = values.key ? String(values.key).trim().toLowerCase() : undefined;
  const useS3 = Boolean(values.s3);
  const force = Boolean(values.force);
  const queryParams = new URLSearchParams();
  if (key) queryParams.set("key", key);
  if (useS3) queryParams.set("s3", "true");
  if (force) queryParams.set("force", "true");
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : "";

  console.log(
    `Taking database backup for application ${colors.cyan(appId)}${key ? ` (key: ${colors.bold(key)})` : ""}${useS3 ? ` [replicate to S3]` : ""}${force ? ` [force]` : ""}...`,
  );

  const backup = await api<DatabaseBackupFile>(
    `/api/apps/${encodeURIComponent(appId)}/db/backups${queryStr}`,
    {
      method: "POST",
      body: JSON.stringify({ key, s3: useS3, force }),
    },
  );

  if (backup.skipped || backup.unchanged) {
    console.log(
      `\n${colors.yellow("ℹ")} Database content has not changed since the last backup.`,
    );
    console.log(`  Skipped saving duplicate backup to disk and S3.`);
    if (backup.filename) {
      console.log(
        `  Latest  : ${colors.cyan(backup.filename)} (${backup.sizeFormatted})`,
      );
    }
    console.log(
      `  Tip     : Use ${colors.bold("--force")} (or ${colors.bold("-f")}) to take a backup anyway.\n`,
    );
    return;
  }

  console.log(`\n${colors.green("✔")} Database backup successfully created!`);
  console.log(`  File    : ${colors.cyan(backup.filename)}`);
  console.log(`  Key     : ${colors.yellow(backup.key || key || "default")}`);
  console.log(`  Size    : ${colors.bold(backup.sizeFormatted)}`);
  console.log(
    `  Storage : ${backup.storage === "both" || backup.s3Url ? colors.green(`Synced (local VPS + S3: ${backup.s3Url})`) : colors.dim("Local VPS disk only")}`,
  );
  console.log(
    `  Created : ${colors.dim(new Date(backup.createdAt).toLocaleString())}\n`,
  );
}

async function runRestore(args: string[]): Promise<void> {
  const { appId, positionals, values } = parseAppCommand(
    args,
    "db backup restore",
    {
      key: { type: "string", short: "k" },
      yes: { type: "boolean", short: "y" },
    },
  );

  const backupId = positionals[0]?.trim();
  if (!backupId) {
    throw new Error(
      "Backup ID or filename is required. Usage: eda db backup restore [-a <appId>] <backupId> [-k <key>]",
    );
  }

  const key = values.key ? String(values.key).trim().toLowerCase() : undefined;

  if (!values.yes) {
    if (!input.isTTY) {
      throw new Error(
        `Cannot prompt for confirmation in a non-interactive environment. Specify -y/--yes to confirm restoring backup "${backupId}".`,
      );
    }

    console.log(`
${colors.yellow("WARNING:")} Restoring this database backup will overwrite existing database data!
Application: ${colors.cyan(appId)}
Backup Archive: ${colors.bold(backupId)}${key ? `\nTarget Key: ${colors.yellow(key)}` : ""}
`);

    const confirmed = await askConfirm(
      `Are you sure you want to restore this backup? ${colors.dim("[y/N]")} `,
      false,
    );

    if (!confirmed) {
      console.log(`\n${colors.dim("Database restore cancelled.")}\n`);
      return;
    }
  }

  console.log(
    `Restoring database for application ${colors.cyan(appId)} from ${colors.cyan(backupId)}${key ? ` into key "${key}"` : ""}...`,
  );

  const keyQuery = key ? `?key=${encodeURIComponent(key)}` : "";

  const result = await api<{
    restored: boolean;
    backup: string;
    database: string;
    key: string;
  }>(
    `/api/apps/${encodeURIComponent(appId)}/db/backups/${encodeURIComponent(backupId)}/restore${keyQuery}`,
    {
      method: "POST",
      body: key ? JSON.stringify({ key }) : undefined,
    },
  );

  console.log(
    `\n${colors.green("✔")} Database ${colors.bold(result.database)} [key: ${result.key}] successfully restored from backup ${colors.cyan(result.backup)}.\n`,
  );
}

async function runDelete(args: string[]): Promise<void> {
  const { appId, positionals } = parseAppCommand(args, "db backup rm");

  const backupId = positionals[0]?.trim();
  if (!backupId) {
    throw new Error(
      "Backup ID or filename is required. Usage: eda db backup rm [-a <appId>] <backupId>",
    );
  }

  await api(
    `/api/apps/${encodeURIComponent(appId)}/db/backups/${encodeURIComponent(backupId)}`,
    {
      method: "DELETE",
    },
  );

  console.log(
    `\n${colors.green("✔")} Backup ${colors.cyan(backupId)} successfully removed from server.\n`,
  );
}
