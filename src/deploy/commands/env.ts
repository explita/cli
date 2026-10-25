import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import readline from "node:readline";
import { api, apiRaw } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, parseEnvFile, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printEnvHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Environment Variables`,
    desc: "Encrypted application secrets and config",
    commands: [
      [
        "eda env ls [-a <appId>] [--show-values]",
        "List configured environment variables",
      ],
      [
        "eda env set KEY=VALUE [KEY2=val] [-a <appId>] [--apply]",
        "Set one or more environment variables",
      ],
      [
        "eda env set -f <file> [-a <appId>] [--apply]",
        "Export environment variables from file (e.g. .env)",
      ],
      [
        "eda env rm <KEY> [KEY2...] [-a <appId>] [--apply]",
        "Remove environment variable(s)",
      ],
      [
        "eda env apply [-a <appId>]",
        "Reload running container to apply pending environment variables",
      ],
      [
        "eda env pull [-a <appId>] [-f <file>]",
        "Import variables to local file (default: .env.production)",
      ],
      [
        "eda env diff [file] [-a <appId>] [--show-values] [--all]",
        "Compare local env file with server variables",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from explita.json)",
      ],
      ["-s, --show-values", "Display decrypted plaintext values in listing"],
      ["-A, --all", "Include in-sync matching variables in diff output"],
      [
        "-f, --file <path>",
        "File path for importing or exporting environment variables",
      ],
      ["--apply", "Immediately reload running container with zero downtime"],
      ["-h, --help", "Show help"],
    ],
  });
}

async function streamEnvReloadResponse(
  response: Response,
  actionType: "set" | "rm" | "apply",
  appId: string,
): Promise<void> {
  if (!response.body) {
    throw new Error("No response body received from server");
  }

  const stream = Readable.fromWeb(response.body as any);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let doneEvent: any;
  let hasLoggedHeader = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === "saved") {
      console.log(
        `\n${colors.green("✔")} Successfully encrypted & saved ${event.count} variable(s) for ${colors.cyan(appId)}.`,
      );
      console.log(
        `  Total configured variables: ${colors.bold(String(event.totalCount))}`,
      );
    } else if (event.type === "deleted") {
      console.log(
        `\n${colors.green("✔")} Removed ${event.removedCount} variable(s) from ${colors.cyan(appId)}.`,
      );
      console.log(
        `  Remaining variables: ${colors.bold(String(event.totalCount))}`,
      );
    } else if (event.type === "log") {
      if (!hasLoggedHeader) {
        console.log(
          `\n${colors.cyan("ℹ")} Applying zero-downtime container reload:`,
        );
        hasLoggedHeader = true;
      }
      console.log(`  ${colors.dim("→")} ${event.line}`);
    } else if (event.type === "done") {
      doneEvent = event;
    } else if (event.type === "error") {
      console.log(`\n${colors.red("✖")} ${event.error}\n`);
      throw new Error(event.error);
    }
  }

  if (doneEvent) {
    if (doneEvent.applied) {
      console.log(
        `\n${colors.green("✔")} Applied immediately to running container (${doneEvent.containerName || "active"}). Zero downtime.\n`,
      );
    } else {
      console.log(
        `\n${colors.yellow("ℹ")} App has no active deployment to reload; variables will apply on first deploy.\n`,
      );
    }
  }
}

export async function runEnvCommand(args: string[]): Promise<void> {
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case "--help":
    case "-h":
    case undefined: {
      printEnvHelp();
      return;
    }

    case "ls": {
      const { appId, values } = parseAppCommand(args.slice(1), "env ls", {
        "show-values": { type: "boolean", short: "s", default: false },
      });

      const showValues = Boolean(values["show-values"]);
      const query = showValues ? "?show=true" : "";

      const res = await api<{
        appId: string;
        env: Record<string, string>;
        count: number;
      }>(`/api/apps/${encodeURIComponent(appId)}/env${query}`);

      const entries = Object.entries(res.env || {});
      if (entries.length === 0) {
        console.log(
          `\nNo environment variables set for app ${colors.cyan(appId)}.\n`,
        );
        return;
      }

      console.log(
        `\nEnvironment variables for ${colors.cyan(appId)} (${entries.length}):`,
      );
      const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

      for (const [key, val] of entries) {
        const paddedKey = key.padEnd(maxKeyLen + 2);
        const displayVal = showValues ? colors.green(val) : colors.dim(val);
        console.log(`  ${colors.bold(paddedKey)} ${displayVal}`);
      }

      if (!showValues) {
        console.log(
          `\n${colors.dim("Values are masked. Use --show-values (-s) to reveal.")}\n`,
        );
      } else {
        console.log("");
      }
      break;
    }

    case "set": {
      const { appId, positionals, values } = parseAppCommand(
        args.slice(1),
        "env set",
        {
          file: { type: "string", short: "f" },
          apply: { type: "boolean" },
        },
      );

      const envMap: Record<string, string> = {};

      if (values.file) {
        const filePath = resolve(process.cwd(), values.file as string);
        try {
          const fromFile = parseEnvFile(filePath);
          Object.assign(envMap, fromFile);
        } catch (err: any) {
          throw new Error(
            `Failed to read env file "${filePath}": ${err.message}`,
          );
        }
      }

      // Parse inline KEY=VALUE arguments
      for (const arg of positionals) {
        const eqIdx = arg.indexOf("=");
        if (eqIdx === -1) {
          throw new Error(
            `Invalid environment variable assignment "${arg}". Expected KEY=VALUE format.`,
          );
        }
        const key = arg.slice(0, eqIdx).trim();
        const val = arg.slice(eqIdx + 1);
        if (!key) {
          throw new Error(`Empty key in assignment "${arg}".`);
        }
        envMap[key] = val;
      }

      if (Object.keys(envMap).length === 0) {
        throw new Error(
          `No variables provided to set. Usage: eda env set KEY=VALUE [--apply] or eda env set -f .env [--apply]`,
        );
      }

      const shouldApply = Boolean(values.apply);

      if (shouldApply) {
        const response = await apiRaw(
          `/api/apps/${encodeURIComponent(appId)}/env?apply=true&stream=true`,
          {
            method: "POST",
            headers: { accept: "application/x-ndjson" },
            body: JSON.stringify({ env: envMap }),
          },
        );
        if (
          !response.ok &&
          !response.headers
            .get("content-type")
            ?.includes("application/x-ndjson")
        ) {
          const err = await response
            .json()
            .catch(() => ({ error: "Request failed" }));
          throw new Error(
            err.error || `Request failed with status ${response.status}`,
          );
        }
        await streamEnvReloadResponse(response, "set", appId);
      } else {
        const res = await api<{
          totalCount: number;
          keys: string[];
          applied?: boolean;
          containerName?: string;
        }>(`/api/apps/${encodeURIComponent(appId)}/env`, {
          method: "POST",
          body: JSON.stringify({ env: envMap }),
        });

        console.log(
          `\n${colors.green("✔")} Successfully encrypted & saved ${Object.keys(envMap).length} variable(s) for ${colors.cyan(appId)}.`,
        );
        console.log(
          `  Total configured variables: ${colors.bold(String(res.totalCount))}`,
        );
        console.log(
          `  ${colors.dim("Changes will apply on your next deployment (or pass --apply to reload now).")}\n`,
        );
      }
      break;
    }

    case "rm": {
      const { appId, positionals, values } = parseAppCommand(
        args.slice(1),
        "env rm",
        {
          apply: { type: "boolean" },
        },
      );

      if (positionals.length === 0) {
        throw new Error(
          `Provide at least one variable name to remove. Usage: eda env rm <KEY> [KEY2...] [--apply]`,
        );
      }

      const shouldApply = Boolean(values.apply);

      if (shouldApply) {
        const response = await apiRaw(
          `/api/apps/${encodeURIComponent(appId)}/env?apply=true&stream=true`,
          {
            method: "DELETE",
            headers: { accept: "application/x-ndjson" },
            body: JSON.stringify({ keys: positionals }),
          },
        );
        if (
          !response.ok &&
          !response.headers
            .get("content-type")
            ?.includes("application/x-ndjson")
        ) {
          const err = await response
            .json()
            .catch(() => ({ error: "Request failed" }));
          throw new Error(
            err.error || `Request failed with status ${response.status}`,
          );
        }
        await streamEnvReloadResponse(response, "rm", appId);
      } else {
        const res = await api<{
          removedCount: number;
          totalCount: number;
          keys: string[];
          applied?: boolean;
          containerName?: string;
        }>(`/api/apps/${encodeURIComponent(appId)}/env`, {
          method: "DELETE",
          body: JSON.stringify({ keys: positionals }),
        });

        console.log(
          `\n${colors.green("✔")} Removed variable(s) [${positionals.join(", ")}] from ${colors.cyan(appId)}.`,
        );
        console.log(
          `  Remaining variables: ${colors.bold(String(res.totalCount))}`,
        );
        console.log(
          `  ${colors.dim("Changes will apply on your next deployment (or pass --apply to reload now).")}\n`,
        );
      }
      break;
    }

    case "apply": {
      const { appId } = parseAppCommand(args.slice(1), "env apply");
      const response = await apiRaw(
        `/api/apps/${encodeURIComponent(appId)}/env/apply?stream=true`,
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
      await streamEnvReloadResponse(response, "apply", appId);
      break;
    }

    case "pull": {
      const { appId, values } = parseAppCommand(args.slice(1), "env pull", {
        file: { type: "string", short: "f", default: ".env.production" },
      });

      const fileName = (values.file as string) || ".env.production";
      const targetPath = resolve(process.cwd(), fileName);

      const res = await api<{
        appId: string;
        env: Record<string, string>;
        count: number;
      }>(`/api/apps/${encodeURIComponent(appId)}/env?show=true`);

      const entries = Object.entries(res.env || {});
      const lines = [
        `# Exported from Explita app ${appId} on ${new Date().toISOString()}`,
        ...entries.map(([k, v]) => `${k}=${v}`),
        "",
      ];

      writeFileSync(targetPath, lines.join("\n"), "utf8");

      console.log(
        `\n${colors.green("✔")} Successfully exported ${entries.length} variable(s) to ${colors.cyan(fileName)}.\n`,
      );
      break;
    }

    case "diff": {
      await runEnvDiff(args);
      break;
    }

    default:
      printEnvHelp();
      throw new Error(
        `Unknown env command: "${subCommand}". Use "eda env ls", "eda env set", "eda env rm", "eda env apply", "eda env pull", or "eda env diff".`,
      );
  }
}

async function runEnvDiff(args: string[]): Promise<void> {
  const { appId, positionals, values } = parseAppCommand(
    args.slice(1),
    "env diff",
    {
      file: { type: "string", short: "f" },
      "show-values": { type: "boolean", short: "s", default: false },
      all: { type: "boolean", short: "A", default: false },
    },
  );

  const showValues = Boolean(values["show-values"]);
  const showAll = Boolean(values.all);
  let targetFile = (values.file as string) || positionals[0];
  if (!targetFile) {
    if (existsSync(resolve(process.cwd(), ".env"))) {
      targetFile = ".env";
    } else if (existsSync(resolve(process.cwd(), ".env.production"))) {
      targetFile = ".env.production";
    } else if (existsSync(resolve(process.cwd(), ".env.local"))) {
      targetFile = ".env.local";
    } else {
      targetFile = ".env";
    }
  }

  const filePath = resolve(process.cwd(), targetFile);
  if (!existsSync(filePath)) {
    throw new Error(
      `Local env file "${targetFile}" not found. Specify a file: eda env diff <file> or eda env diff -f <file>`,
    );
  }

  let localEnv: Record<string, string>;
  try {
    localEnv = parseEnvFile(filePath);
  } catch (err: any) {
    throw new Error(
      `Failed to parse local file "${targetFile}": ${err.message}`,
    );
  }

  const res = await api<{
    appId: string;
    env: Record<string, string>;
    count: number;
  }>(`/api/apps/${encodeURIComponent(appId)}/env?show=true`);

  const serverEnv = res.env || {};

  const localKeys = Object.keys(localEnv);
  const serverKeys = Object.keys(serverEnv);

  const added = localKeys.filter((k) => !(k in serverEnv));
  const removed = serverKeys.filter((k) => !(k in localEnv));
  const changed = localKeys.filter(
    (k) => k in serverEnv && localEnv[k] !== serverEnv[k],
  );
  const identical = localKeys.filter(
    (k) => k in serverEnv && localEnv[k] === serverEnv[k],
  );

  console.log(
    `\nComparing local ${colors.bold(targetFile)} against server ${colors.cyan(appId)}:\n`,
  );

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log(
      `${colors.green("✔")} In sync: all ${colors.bold(String(identical.length))} variable(s) match the server.\n`,
    );
    if (showValues && identical.length > 0) {
      for (const k of identical) {
        console.log(
          `  ${colors.green("=")} ${colors.bold(k)} = ${colors.dim(localEnv[k])}`,
        );
      }
      console.log("");
    } else if (!showValues && identical.length > 0) {
      console.log(
        colors.dim("Use --show-values (-s) to inspect the matching values.\n"),
      );
    }
    return;
  }

  for (const k of added) {
    const valDisplay = showValues ? ` = ${colors.green(localEnv[k])}` : "";
    console.log(
      `  ${colors.green("+")} ${colors.bold(k)}${valDisplay} ${colors.dim("(local only, missing on server)")}`,
    );
  }

  for (const k of removed) {
    const valDisplay = showValues ? ` = ${colors.red(serverEnv[k])}` : "";
    console.log(
      `  ${colors.red("-")} ${colors.bold(k)}${valDisplay} ${colors.dim("(server only, missing in local)")}`,
    );
  }

  for (const k of changed) {
    const valDisplay = showValues
      ? ` ${colors.red(serverEnv[k])} -> ${colors.green(localEnv[k])}`
      : "";
    console.log(
      `  ${colors.yellow("~")} ${colors.bold(k)}${valDisplay} ${colors.dim("(value differs)")}`,
    );
  }

  if (showAll && identical.length > 0) {
    for (const k of identical) {
      const valDisplay = showValues ? ` = ${colors.dim(localEnv[k])}` : "";
      console.log(
        `  ${colors.dim("=")} ${colors.bold(k)}${valDisplay} ${colors.dim("(in sync)")}`,
      );
    }
  }

  const summaryParts: string[] = [];
  if (added.length > 0)
    summaryParts.push(colors.green(`${added.length} to add`));
  if (removed.length > 0)
    summaryParts.push(colors.red(`${removed.length} to remove`));
  if (changed.length > 0)
    summaryParts.push(colors.yellow(`${changed.length} modified`));
  if (identical.length > 0)
    summaryParts.push(colors.dim(`${identical.length} in sync`));

  console.log(`\nSummary: ${summaryParts.join(", ")}`);
  if (!showValues && changed.length > 0) {
    console.log(
      colors.dim("Use --show-values (-s) to reveal plaintext diff values.\n"),
    );
  } else {
    console.log("");
  }
}
