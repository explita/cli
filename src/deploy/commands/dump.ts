import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { api, apiRaw } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import {
  describeCron,
  type DumpScheduleConfig,
} from "@explita/infra-protocol/deploy";

function printDumpHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Dump`,
    desc: "Export compressed full-system or application backup archive",
    commands: [
      [
        "eda dump [-a <appId>] [-d] [-f] [-e] [--reveal-secrets] [--s3] [-o <file>]",
        "Export full backup archive for app or cluster",
      ],
      [
        "eda dump schedule [-a <appId>] [--daily|--weekly|--monthly|--cron <expr>] [--keep <n>] [--s3] [--disable]",
        "Configure automated full-system or application dump schedule",
      ],
    ],
    examples: [
      ["eda dump", "Dump all apps with all components (redacted)"],
      ["eda dump -a my-app", "Dump everything for a specific app"],
      ["eda dump -a my-app --s3", "Export app dump and upload directly to S3"],
      ["eda dump --all --s3", "Export cluster dump and upload directly to S3"],
      ["eda dump -a my-app -d", "Dump database only for my-app"],
      ["eda dump -a my-app -s", "Backup with raw plaintext credentials"],
      ["eda dump -o backup.tar.gz", "Save cluster dump to backup.tar.gz"],
      [
        "eda dump > cluster.tar.gz",
        "Stream dump archive directly through pipe",
      ],
      [
        "eda dump schedule -a my-app --weekly --s3",
        "Automate weekly dumps uploaded directly to S3",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target a specific application (default: all applications)",
      ],
      ["-A, --all", "Explicitly dump all applications across the cluster"],
      ["-d, --db", "Include database dumps (.sql)"],
      ["-f, --files", "Include deployment source files"],
      ["-e, --env", "Include environment variables (.env)"],
      [
        "-s, --reveal-secrets",
        "Include unredacted secrets and database credentials (default: redacted)",
      ],
      [
        "--s3",
        "Upload dump archive directly to S3 (requires S3 configured via 'eda s3 set')",
      ],
      [
        "-o, --output <file>",
        "Destination file path (default: auto-named file or stdout when piped)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runDumpCommand(args: string[]): Promise<void> {
  const first = args[0]?.toLowerCase();

  if (first === "schedule") {
    return runDumpSchedule(args.slice(1));
  }

  const { appId, values } = parseAppCommand(
    args,
    "dump",
    {
      all: { type: "boolean", short: "A" },
      db: { type: "boolean", short: "d" },
      files: { type: "boolean", short: "f" },
      env: { type: "boolean", short: "e" },
      "reveal-secrets": { type: "boolean", short: "s" },
      s3: { type: "boolean" },
      output: { type: "string", short: "o" },
    },
    { optional: true },
  );

  if (values.help) {
    printDumpHelp();
    return;
  }

  const targetAppId = values.all ? undefined : appId;

  const params = new URLSearchParams();

  const hasComponentFilter = Boolean(values.db || values.files || values.env);
  if (hasComponentFilter) {
    params.set("db", values.db ? "true" : "false");
    params.set("files", values.files ? "true" : "false");
    params.set("env", values.env ? "true" : "false");
  }

  const revealSecrets = Boolean(values["reveal-secrets"]);
  if (revealSecrets) {
    params.set("revealSecrets", "true");
  }

  const useS3 = Boolean(values.s3);
  if (useS3) {
    params.set("s3", "true");
  }

  const queryString = params.toString() ? `?${params.toString()}` : "";
  const endpoint = targetAppId
    ? `/api/apps/${encodeURIComponent(targetAppId)}/dump${queryString}`
    : `/api/apps/dump${queryString}`;

  if (process.stdout.isTTY) {
    const scopeLabel = targetAppId
      ? `application ${colors.cyan(targetAppId)}`
      : "all applications (system-wide)";
    const secretsLabel = revealSecrets
      ? colors.yellow("unredacted secrets")
      : colors.dim("redacted secrets");
    const destinationLabel = useS3
      ? colors.green("➔ S3 bucket")
      : "local archive";

    console.error(
      `Creating compressed backup archive for ${scopeLabel} [${secretsLabel}] [${destinationLabel}]...`,
    );
  }

  // If S3 upload was requested, the server processes and uploads to S3 directly, returning JSON
  if (useS3) {
    const result = await api<{
      success: boolean;
      message: string;
      data: {
        filename: string;
        sizeBytes: number;
        sizeFormatted: string;
        s3Url: string;
        bucket: string;
        s3Key: string;
      };
    }>(endpoint);

    const d = result.data;
    console.log(
      `\n${colors.green("✔")} ${result.message || "Dump archive uploaded to S3 successfully."}`,
    );
    console.log(`  File    : ${colors.cyan(d.filename)}`);
    console.log(`  Bucket  : ${colors.bold(d.bucket)}`);
    console.log(`  S3 Key  : ${colors.yellow(d.s3Key)}`);
    console.log(`  Size    : ${colors.bold(d.sizeFormatted)}`);
    console.log(`  S3 URL  : ${colors.dim(d.s3Url)}\n`);
    return;
  }

  const response = await apiRaw(endpoint);

  if (!response.body) {
    throw new Error("No response body received from server dump endpoint.");
  }

  const nodeReadable = Readable.fromWeb(response.body as any);

  let destinationFile = values.output as string;

  if (!destinationFile && process.stdout.isTTY) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    destinationFile = targetAppId
      ? `explita-dump-${targetAppId}-${timestamp}.tar.gz`
      : `explita-dump-all-${timestamp}.tar.gz`;
  }

  if (destinationFile) {
    const filePath = resolve(process.cwd(), destinationFile);
    const fileStream = createWriteStream(filePath);

    await pipeline(nodeReadable, fileStream);

    console.error(
      `\n${colors.green("✔")} Archive saved to ${colors.cyan(filePath)}.\n`,
    );
  } else {
    // Stream directly to process.stdout without buffering (pipe/redirection)
    await pipeline(nodeReadable, process.stdout, { end: false });
  }
}

async function runDumpSchedule(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "dump schedule", {
    daily: { type: "boolean" },
    weekly: { type: "boolean" },
    monthly: { type: "boolean" },
    cron: { type: "string" },
    keep: { type: "string" },
    s3: { type: "boolean" },
    "no-s3": { type: "boolean" },
    disable: { type: "boolean" },
  });

  if (values.help) {
    printDumpHelp();
    return;
  }

  const hasScheduleInput =
    values.daily ||
    values.weekly ||
    values.monthly ||
    Boolean(values.cron) ||
    values.keep !== undefined ||
    values.s3 !== undefined ||
    values["no-s3"] !== undefined ||
    values.disable !== undefined;

  if (!hasScheduleInput) {
    // View current dump schedule
    const schedule = await api<DumpScheduleConfig>(
      `/api/apps/${encodeURIComponent(appId)}/dump/schedule`,
    );

    console.log(
      `\n${colors.bold("Automated Full Dump Schedule for application")} ${colors.cyan(appId)}:\n`,
    );
    console.log(
      `  Status         : ${schedule.enabled ? colors.green("Enabled") : colors.dim("Disabled")}`,
    );
    console.log(`  Schedule       : ${colors.bold(schedule.schedule)}`);
    console.log(
      `  Description    : ${colors.cyan(describeCron(schedule.schedule))}`,
    );
    console.log(
      `  Retention      : Keep ${colors.bold(String(schedule.keep || 4))} latest dumps`,
    );
    console.log(
      `  S3 Replication : ${schedule.s3 ? colors.green("✔ Enabled (uploads to S3)") : colors.dim("Off (local server only)")}`,
    );

    if (schedule.lastRunAt) {
      console.log(
        `  Last Run       : ${colors.dim(new Date(schedule.lastRunAt).toLocaleString())}`,
      );
      console.log(
        `  Last Status    : ${schedule.lastStatus === "success" ? colors.green("success") : colors.red(schedule.lastStatus || "unknown")}`,
      );
      if (schedule.lastFilename) {
        console.log(`  Last Archive   : ${colors.cyan(schedule.lastFilename)}`);
      }
      if (schedule.lastS3Url) {
        console.log(`  Last S3 URL    : ${colors.dim(schedule.lastS3Url)}`);
      }
      if (schedule.lastError) {
        console.log(`  Last Error     : ${colors.red(schedule.lastError)}`);
      }
    }

    console.log(
      `\n  ${colors.dim(`Configure: eda dump schedule -a ${appId} --weekly --keep 4 --s3`)}\n`,
    );
    return;
  }

  // Update schedule
  let cronExpression: string | undefined;
  if (values.daily) cronExpression = "0 3 * * *";
  else if (values.weekly) cronExpression = "0 3 * * 0";
  else if (values.monthly) cronExpression = "0 3 1 * *";
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
    `Updating dump schedule for application ${colors.cyan(appId)}...`,
  );

  const updated = await api<DumpScheduleConfig>(
    `/api/apps/${encodeURIComponent(appId)}/dump/schedule`,
    {
      method: "POST",
      body: JSON.stringify({
        schedule: cronExpression,
        keep: keepCount,
        enabled,
        s3: s3Enabled,
      }),
    },
  );

  console.log(`\n${colors.green("✔")} Dump schedule updated successfully!`);
  console.log(
    `  Status         : ${updated.enabled ? colors.green("Enabled") : colors.dim("Disabled")}`,
  );
  console.log(
    `  Schedule       : ${colors.bold(updated.schedule)} (${colors.cyan(describeCron(updated.schedule))})`,
  );
  console.log(
    `  Retention      : Keep ${colors.bold(String(updated.keep || 4))} latest dumps`,
  );
  console.log(
    `  S3 Replication : ${updated.s3 ? colors.green("✔ Enabled") : colors.dim("Off (local server only)")}\n`,
  );
}
