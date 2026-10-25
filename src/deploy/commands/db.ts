import { existsSync, createReadStream, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { api, apiRaw } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { runDbBackupCommand } from "./db-backup.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printDbHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Database`,
    desc: "Managed PostgreSQL and MariaDB / MySQL databases for your apps",
    commands: [
      [
        "eda db create [-a <appId>] [-k <key>] [-t <type>] [-n <name>] [-u <user>] [-p <pass>]",
        "Provision managed database (type: postgres or mysql)",
      ],
      [
        "eda db url [-a <appId>] [-k <key>]",
        "View connection string (DATABASE_URL)",
      ],
      [
        "eda db dump [-a <appId>] [-k <key>] [-f <file>]",
        "Export SQL dump of database (stdout or file)",
      ],
      [
        "eda db restore [-a <appId>] [-k <key>] [-f <file>]",
        "Restore database from SQL dump (stdin or file)",
      ],
      [
        "eda db seed <file> [-a <appId>] [-k <key>]",
        "Seed database from SQL file (or -f <file>)",
      ],
      [
        "eda db backup schedule [-a <appId>] [-k <key>] [--daily] [--keep <n>] [--s3]",
        "Configure automated backup schedule & retention",
      ],
      [
        "eda db backup ls [-a <appId>] [-k <key>]",
        "List automated backups on server",
      ],
      [
        "eda db backup create [-a <appId>] [-k <key>] [--s3]",
        "Trigger immediate backup snapshot on server",
      ],
      [
        "eda db backup restore [-a <appId>] <backupId> [-k <key>]",
        "Restore from server backup archive",
      ],
      [
        "eda db backup rm [-a <appId>] <backupId>",
        "Delete backup archive from server",
      ],
      ["eda db rm [-a <appId>] [-k <key>]", "Drop database and user"],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from explita.json)",
      ],
      ["-k, --key <key>", "Database key identifier (default: default)"],
      [
        "-f, --file <file>",
        "File path for database dump output or restore input",
      ],
      [
        "-n, --name <name>",
        "Database name (default: app_<appId> or app_<appId>_<key>)",
      ],
      [
        "-u, --user <user>",
        "Database user (default: user_<appId> or user_<appId>_<key>)",
      ],
      [
        "-p, --pass <pass>",
        "Database password (default: random secure string)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runDbCommand(args: string[]): Promise<void> {
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case "--help":
    case "-h":
    case undefined: {
      printDbHelp();
      return;
    }

    case "create": {
      await runDbCreate(args);
      break;
    }

    case "url": {
      const { appId, values } = parseAppCommand(args.slice(1), "db url", {
        key: { type: "string", short: "k" },
      });

      const key = values.key as string | undefined;
      const query = key ? `?key=${encodeURIComponent(key)}` : "";

      const result = await api<{
        appId: string;
        key: string;
        name: string;
        user: string;
        url: string;
        databases?: Array<{
          key: string;
          name: string;
          user: string;
          url: string;
        }>;
      }>(`/api/apps/${encodeURIComponent(appId)}/db${query}`);

      if (!key && result.databases && result.databases.length > 1) {
        console.log(
          `\n${colors.bold("Databases configured for")} ${colors.cyan(appId)}:`,
        );
        for (const db of result.databases) {
          const envName =
            db.key === "default"
              ? "DATABASE_URL"
              : `${db.key.toUpperCase()}_DATABASE_URL`;
          console.log(
            `  ${colors.bold(db.key)} (${db.name}) [${envName}]:\n    ${colors.green(db.url)}`,
          );
        }
        console.log();
      } else {
        const envName =
          result.key === "default"
            ? "DATABASE_URL"
            : `${result.key.toUpperCase()}_DATABASE_URL`;
        console.log(
          `\n${colors.bold(envName)}${result.key !== "default" ? ` (${result.key})` : ""}:\n${colors.green(result.url)}\n`,
        );
      }
      break;
    }

    case "backups": {
      await runDbBackupCommand(
        args.slice(1).length === 0 ? ["ls"] : args.slice(1),
      );
      break;
    }

    case "backup": {
      const backupSub = args[1]?.toLowerCase();
      const isBackup =
        backupSub &&
        [
          "schedule",
          "ls",
          "list",
          "create",
          "now",
          "restore",
          "rm",
          "delete",
          "--help",
          "-h",
        ].includes(backupSub);
      if (isBackup) {
        await runDbBackupCommand(args.slice(1));
      } else {
        await runDbDump(args);
      }
      break;
    }

    case "dump": {
      await runDbDump(args);
      break;
    }

    case "seed":
    case "restore": {
      await runDbRestore(args);
      break;
    }

    case "rm":
    case "drop": {
      const { appId, values } = parseAppCommand(args.slice(1), "db rm", {
        key: { type: "string", short: "k" },
      });

      const key = values.key as string | undefined;
      const query = key ? `?key=${encodeURIComponent(key)}` : "";

      await api(`/api/apps/${encodeURIComponent(appId)}/db${query}`, {
        method: "DELETE",
      });

      console.log(
        `\n${colors.green("✔")} Database ${key ? `(key: "${key}") ` : ""}successfully removed for application ${colors.cyan(appId)}.\n`,
      );
      break;
    }

    default:
      printDbHelp();
      throw new Error(
        `Unknown database command: "${subCommand}". Use "eda db create", "eda db url", "eda db dump", "eda db restore", "eda db seed", or "eda db rm".`,
      );
  }
}

async function runDbCreate(args: string[]) {
  const { appId, values } = parseAppCommand(args.slice(1), "db create", {
    key: { type: "string", short: "k" },
    type: { type: "string", short: "t" },
    name: { type: "string", short: "n" },
    user: { type: "string", short: "u" },
    pass: { type: "string", short: "p" },
  });

  const key = (values.key as string | undefined)?.toLowerCase() || "default";
  const dbType = (values.type as string | undefined)?.toLowerCase();

  console.log(
    `Provisioning ${dbType || "postgres"} database${key !== "default" ? ` (key: "${key}")` : ""} for application ${colors.cyan(appId)}...`,
  );

  const result = await api<{
    appId: string;
    key: string;
    name: string;
    user: string;
    type?: string;
    url: string;
  }>(`/api/apps/${encodeURIComponent(appId)}/db`, {
    method: "POST",
    body: JSON.stringify({
      key,
      type: dbType,
      name: values.name,
      user: values.user,
      password: values.pass,
    }),
  });

  const envVar =
    result.key === "default"
      ? "DATABASE_URL"
      : `${result.key.toUpperCase()}_DATABASE_URL`;
  console.log(
    `${colors.green("✔")} Database ${colors.bold(result.name)} (key: "${result.key}") created for ${colors.cyan(appId)}.`,
  );
  console.log(`  User: ${colors.bold(result.user)}`);
  console.log(
    `  ${envVar} will be automatically injected into your app on next deploy.`,
  );
  console.log(
    `  To view the connection string, run: ${colors.cyan(`eda db url -a ${appId}${result.key === "default" ? "" : ` -k ${result.key}`}`)}`,
  );
}

async function runDbDump(args: string[]) {
  const { appId, values } = parseAppCommand(args.slice(1), "db dump", {
    key: { type: "string", short: "k" },
    file: { type: "string", short: "f" },
  });

  const key = values.key as string | undefined;
  const targetFile = values.file as string | undefined;
  const query = key ? `?key=${encodeURIComponent(key)}` : "";

  const response = await apiRaw(
    `/api/apps/${encodeURIComponent(appId)}/db/dump${query}`,
  );

  if (!response.body) {
    throw new Error("No response body received from database dump");
  }

  const nodeReadable = Readable.fromWeb(response.body as any);

  let destinationFile = targetFile;

  // Fallback to appId+timestamp if running in interactive terminal without -f or pipe/redirection
  if (!destinationFile && process.stdout.isTTY) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const keySuffix = key && key !== "default" ? `-${key}` : "";
    destinationFile = `${appId}${keySuffix}-${timestamp}.sql`;
  }

  if (destinationFile) {
    const filePath = resolve(process.cwd(), destinationFile);
    const fileStream = createWriteStream(filePath);
    await pipeline(nodeReadable, fileStream);
    console.error(
      `\n${colors.green("✔")} Database dump saved to ${colors.cyan(filePath)}.\n`,
    );
  } else {
    // Stream directly to process.stdout without buffering in RAM (e.g. eda db dump -a <appId> > backup.sql)
    await pipeline(nodeReadable, process.stdout, { end: false });
  }
}

async function runDbRestore(args: string[]) {
  const isSeed = args[0]?.toLowerCase() === "seed";
  const actionName = isSeed ? "seed" : "restore";
  const { appId, positionals, values } = parseAppCommand(
    args.slice(1),
    `db ${actionName}`,
    {
      key: { type: "string", short: "k" },
      file: { type: "string", short: "f" },
    },
  );

  const key = values.key as string | undefined;
  const targetFile = (values.file as string | undefined) || positionals[0];
  const query = key ? `?key=${encodeURIComponent(key)}` : "";

  let stream: NodeJS.ReadableStream;

  if (targetFile) {
    const filePath = resolve(process.cwd(), targetFile);
    if (!existsSync(filePath)) {
      throw new Error(`SQL file not found: ${filePath}`);
    }
    stream = createReadStream(filePath);
    process.stderr.write(
      `\n${isSeed ? "Seeding" : "Restoring"} database${key && key !== "default" ? ` (key: "${key}")` : ""} for application ${colors.cyan(appId)} from ${colors.cyan(targetFile)}...\n`,
    );
  } else {
    if (process.stdin.isTTY) {
      throw new Error(
        isSeed
          ? `No SQL seed file provided. Usage: eda db seed <file> [-a <appId>]${key ? ` [-k ${key}]` : ""}`
          : `No SQL backup data provided on stdin. Usage: eda db restore -a <appId> < backup.sql or eda db restore -a <appId> -f backup.sql`,
      );
    }
    // Read from process.stdin (e.g. eda db restore -a <appId> < backup.sql)
    stream = process.stdin;
    process.stderr.write(
      `\nRestoring database${key && key !== "default" ? ` (key: "${key}")` : ""} for application ${colors.cyan(appId)} from stdin...\n`,
    );
  }

  await apiRaw(`/api/apps/${encodeURIComponent(appId)}/db/restore${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/sql",
    },
    body: stream as any,
    duplex: "half",
  } as any);

  console.error(
    `${colors.green("✔")} Database successfully ${isSeed ? "seeded" : "restored"} for application ${colors.cyan(appId)}.\n`,
  );
}
