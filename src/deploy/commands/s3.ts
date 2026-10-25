import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import type { S3Config, S3Status } from "@explita/infra-protocol/deploy";

function printS3Help(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} S3`,
    desc: "Manage off-site S3 / Cloudflare R2 backup & dump replication",
    commands: [
      [
        "eda s3 [status] [-a <appId>]",
        "View S3 configuration and replication status",
      ],
      [
        "eda s3 set [-a <appId>] --bucket <b> --access-key <k> --secret-key <s> [options]",
        "Configure off-site S3 storage credentials",
      ],
      [
        "eda s3 test [-a <appId>]",
        "Verify read/write/delete permissions on remote bucket",
      ],
      [
        "eda s3 rm [-a <appId>]",
        "Remove custom S3 configuration from application",
      ],
    ],
    examples: [
      ["eda s3 status", "View effective S3 replication configuration"],
      [
        "eda s3 set -a my-app --bucket backups --endpoint https://<acc>.r2.cloudflarestorage.com --access-key <id> --secret-key <sec>",
        "Configure Cloudflare R2 for an application",
      ],
      [
        "eda s3 set -a my-app --bucket test --endpoint http://localhost:9000 --access-key admin --secret-key admin --force-path-style",
        "Configure local MinIO storage",
      ],
      ["eda s3 test -a my-app", "Test connectivity and permissions"],
      [
        "eda s3 rm -a my-app",
        "Remove app S3 config (reverts to server default if set)",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (auto-resolved from explita.json)",
      ],
      ["--bucket <name>", "Target S3 / R2 bucket name"],
      ["--endpoint <url>", "Custom S3 endpoint URL (omit for standard AWS S3)"],
      ["--access-key <key>", "S3 Access Key ID / R2 Token ID"],
      ["--secret-key <sec>", "S3 Secret Access Key / R2 Token Secret"],
      [
        "--region <region>",
        "S3 region (default: auto for R2, us-east-1 for AWS/MinIO)",
      ],
      [
        "--prefix <prefix>",
        "Object storage root folder/prefix (default: backups)",
      ],
      [
        "--force-path-style",
        "Use path-style bucket addressing (required for MinIO)",
      ],
      [
        "--disable",
        "Temporarily disable S3 replication without removing credentials",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runS3Command(args: string[]): Promise<void> {
  const first = args[0]?.toLowerCase();

  if (first === "--help" || first === "-h") {
    printS3Help();
    return;
  }

  const subCommand = !first || first.startsWith("-") ? "status" : first;

  const commandArgs = !first || first.startsWith("-") ? args : args.slice(1);

  switch (subCommand) {
    case "status":
      return runS3Status(commandArgs);
    case "set":
      return runS3Set(commandArgs);
    case "test":
      return runS3Test(commandArgs);
    case "rm":
      return runS3Remove(commandArgs);
    default: {
      printS3Help();
      throw new Error(
        `Unknown s3 subcommand: "${subCommand}". Use "status", "set", "test", or "rm".`,
      );
    }
  }
}

export async function runS3Status(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(
    args,
    "s3 status",
    {},
    { optional: true },
  );

  if (values.help) {
    printS3Help();
    return;
  }

  const endpoint = appId
    ? `/api/apps/${encodeURIComponent(appId)}/s3`
    : `/api/apps/s3`;

  const s3 = await api<S3Status>(endpoint);

  const targetLabel = appId
    ? colors.cyan(appId)
    : colors.bold("Server Global Default");
  console.log(
    `\n${colors.bold("Off-site S3 / Cloudflare R2 Backup Replication for")} ${targetLabel}:\n`,
  );

  const statusLabel = s3.enabled
    ? colors.green("✔ Active & Enabled")
    : colors.yellow("⚠ Disabled / Inactive");
  console.log(`  Replication : ${statusLabel}`);

  const sourceLabel =
    s3.source === "app"
      ? colors.cyan("Application-level configuration (explita.json / eda)")
      : s3.source === "server"
        ? colors.magenta("Server-wide default environment (GLOBAL_S3_*)")
        : colors.dim("None configured");
  console.log(`  Config Source: ${sourceLabel}`);

  if (s3.bucket) {
    console.log(`  Bucket      : ${colors.bold(s3.bucket)}`);
    console.log(
      `  Endpoint    : ${s3.endpoint ? colors.dim(s3.endpoint) : colors.dim("Standard AWS S3")}`,
    );
    console.log(`  Region      : ${s3.region || "auto"}`);
    console.log(`  Prefix      : ${s3.prefix || "backups"}`);
    console.log(
      `  Addressing  : ${s3.forcePathStyle ? "Path-style (MinIO)" : "Virtual-hosted (AWS/R2)"}`,
    );
    console.log(
      `  Credentials : ${s3.hasAccessKey && s3.hasSecretKey ? colors.green("✔ Configured & encrypted") : colors.red("✖ Incomplete")}`,
    );
    console.log(
      `\n  ${colors.dim(`Test connection: eda s3 test${appId ? ` -a ${appId}` : ""}`)}`,
    );
    console.log(
      `  ${colors.dim(`Trigger backup : eda db backup create${appId ? ` -a ${appId}` : ""} --s3`)}`,
    );
    console.log(
      `  ${colors.dim(`Upload full dump: eda dump${appId ? ` -a ${appId}` : ""} --s3`)}\n`,
    );
  } else {
    console.log(`\n  ${colors.yellow("No off-site S3 storage configured.")}`);
    console.log(
      `  ${colors.dim(`Configure now: eda s3 set${appId ? ` -a ${appId}` : ""} --bucket <bucket> --access-key <id> --secret-key <sec>`)}\n`,
    );
  }
}

export async function runS3Set(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "s3 set", {
    bucket: { type: "string" },
    "access-key": { type: "string" },
    "secret-key": { type: "string" },
    endpoint: { type: "string" },
    region: { type: "string" },
    prefix: { type: "string" },
    "force-path-style": { type: "boolean" },
    disable: { type: "boolean" },
  });

  if (values.help) {
    printS3Help();
    return;
  }

  const bucket = values.bucket ? String(values.bucket).trim() : undefined;
  const accessKeyId = values["access-key"]
    ? String(values["access-key"]).trim()
    : undefined;
  const secretAccessKey = values["secret-key"]
    ? String(values["secret-key"]).trim()
    : undefined;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing required S3 options. Usage: eda s3 set -a <appId> --bucket <name> --access-key <id> --secret-key <sec> [--endpoint <url>] [--region <reg>] [--prefix <p>]",
    );
  }

  let cleanEndpoint = values.endpoint
    ? String(values.endpoint).trim()
    : undefined;
  // If user pasted endpoint with bucket trailing slash (e.g. Cloudflare S3 URL), strip it
  if (cleanEndpoint && bucket) {
    cleanEndpoint = cleanEndpoint.replace(new RegExp(`/${bucket}/?$`, "i"), "");
  }

  const payload: S3Config = {
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: cleanEndpoint,
    region: values.region ? String(values.region).trim() : "auto",
    prefix: values.prefix ? String(values.prefix).trim() : "backups",
    forcePathStyle: Boolean(values["force-path-style"]),
    enabled: values.disable ? false : true,
  };

  const result = await api<any>(`/api/apps/${encodeURIComponent(appId)}/s3`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const message =
    result?.message ||
    `Off-site S3 backup replication configured successfully for bucket "${bucket}".`;
  console.log(`\n${colors.green("✔")} ${message}\n`);
}

export async function runS3Test(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(
    args,
    "s3 test",
    {},
    { optional: true },
  );

  if (values.help) {
    printS3Help();
    return;
  }

  const targetLabel = appId ? colors.cyan(appId) : "cluster";
  console.log(`Testing S3 connectivity for ${targetLabel}...`);

  const endpoint = appId
    ? `/api/apps/${encodeURIComponent(appId)}/s3/test`
    : `/api/apps/s3/test`;

  const result = await api<{ message: string }>(endpoint, {
    method: "POST",
  });

  console.log(`\n${colors.green("✔")} ${result.message}\n`);
}

export async function runS3Remove(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "s3 rm", {});

  if (values.help) {
    printS3Help();
    return;
  }

  const result = await api<{ message: string }>(
    `/api/apps/${encodeURIComponent(appId)}/s3`,
    {
      method: "DELETE",
    },
  );

  console.log(`\n${colors.green("✔")} ${result.message}\n`);
}
