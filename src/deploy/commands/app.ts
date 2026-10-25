import type { App } from "../types.js";
import { parseArgs } from "node:util";
import { stdin as input } from "node:process";
import { api } from "../lib/api.js";
import { askConfirm } from "../../lib/prompt.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { resolve } from "node:path";
import {
  normalizePreDeploy,
  normalizeHealthCheck,
  normalizeVolumes,
  parseEnvFile,
  loadProjectConfig,
  saveProjectConfig,
  PROJECT_CONFIG_FILENAME,
  PRODUCT_NAME,
  colors,
} from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printAppHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} App Management`,
    desc: "Inspect and manage deployed applications",
    usage: "explita deploy <command> [options]",
    commands: [
      ["ls [-s <query>]", "List applications"],
      ["info [-a <appId>]", "Get application details"],
      [
        "set [-a <appId>] [--memory <mem>] [--cpus <cpus>]",
        "Update application resource limits and settings",
      ],
      ["rm -a <appId> [-y]", "Delete an application (explicit -a required)"],
    ],
    options: [
      [
        "-s, --subdomain <subdomain>",
        "Set or update custom tunnel subdomain (for set)",
      ],
      [
        "-S, --search <query>",
        "Filter applications by name or ID substring (for ls)",
      ],
      ["-t, --tunnel", "Enable automated public HTTPS tunnel (for set)"],
      ["-a, --app <appId>", "Target application ID"],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runAppCommand(args: string[]): Promise<void> {
  const subCommand = args[0];

  switch (subCommand) {
    case "ls": {
      const subArgs = args.slice(1);
      const { values } = parseArgs({
        args: subArgs,
        options: {
          search: { type: "string", short: "s" },
          page: { type: "string", short: "p", default: "1" },
          limit: { type: "string", short: "l", default: "5" },
        },
        strict: false,
      });

      const endpoint = values.search
        ? `/api/apps?search=${encodeURIComponent(String(values.search))}`
        : "/api/apps";

      const apps = await api<App[]>(endpoint);
      if (!apps || apps.length === 0) {
        console.log();
        console.log(
          colors.yellow(
            values.search
              ? `No applications found matching "${values.search}".`
              : "No applications found.",
          ),
        );
        console.log();
        break;
      }

      const formatted = apps.map((a) => {
        const meta = a.metadata ?? {};
        const resources = (meta.resources ?? {}) as Record<string, any>;
        return {
          id: a.id,
          name: a.name,
          status: a.status,
          port: a.port ?? "(auto)",
          memory: resources.memory ?? "-",
          cpus: resources.cpus ?? "-",
          currentDeploymentId: a.currentDeploymentId ?? "-",
          domains: a.domains?.map((d) => d.hostname).join(", ") || "-",
          tunnel:
            meta.tunnel?.url ||
            (meta.tunnel?.enabled === false || meta.tunnelEnabled === false
              ? "(disabled)"
              : "-"),
        };
      });
      console.table(formatted);
      break;
    }

    case "set": {
      if (args.includes("-h") || args.includes("--help")) {
        envSetHelp();
        return;
      }

      const { appId, values } = parseAppCommand(args.slice(1), "set", {
        memory: { type: "string", short: "m" },
        cpus: { type: "string", short: "c" },
        port: { type: "string", short: "p" },
        name: { type: "string", short: "n" },
        subdomain: { type: "string", short: "s" },
        tunnel: { type: "boolean", short: "t" },
        "pre-deploy": { type: "string", multiple: true, short: "P" },
        "no-pre-deploy": { type: "boolean", short: "N" },
        "health-check": { type: "string", short: "H" },
        "no-health-check": { type: "boolean" },
        volume: { type: "string", multiple: true, short: "v" },
        "no-volumes": { type: "boolean" },
        env: { type: "string", multiple: true, short: "e" },
        "env-file": { type: "string" },
      });

      const body: Record<string, any> = {};
      if (values.memory !== undefined) {
        body.memory = String(values.memory);
      }
      if (values.cpus !== undefined) {
        body.cpus = String(values.cpus);
      }
      if (values.port !== undefined) {
        const p = Number(values.port);
        if (Number.isNaN(p) || p <= 0) {
          throw new Error(`Invalid port: ${values.port}`);
        }
        body.port = p;
      }
      if (values.name !== undefined) {
        body.name = String(values.name);
      }
      if (values.subdomain !== undefined) {
        body.subdomain = String(values.subdomain);
      }
      if (values.tunnel !== undefined) {
        body.tunnel = Boolean(values.tunnel);
      }

      if (values["no-pre-deploy"]) {
        body.preDeploy = [];
      } else if (values["pre-deploy"] !== undefined) {
        body.preDeploy = normalizePreDeploy(values["pre-deploy"]);
      }

      if (values["no-health-check"]) {
        body.healthCheck = null;
      } else if (values["health-check"] !== undefined) {
        body.healthCheck = normalizeHealthCheck(values["health-check"] || "/");
      }

      if (values["no-volumes"]) {
        body.volumes = null;
      } else if (values.volume !== undefined) {
        body.volumes = normalizeVolumes(values.volume);
      }

      if (values["env-file"]) {
        const filePath = resolve(process.cwd(), values["env-file"] as string);
        try {
          const fromFile = parseEnvFile(filePath);
          body.env = Object.assign(body.env || {}, fromFile);
        } catch (err: any) {
          throw new Error(
            `Failed to read env file "${filePath}": ${err.message}`,
          );
        }
      }

      if (values.env && values.env.length > 0) {
        body.env = body.env || {};
        for (const item of values.env) {
          const eqIdx = item.indexOf("=");
          if (eqIdx === -1) {
            throw new Error(
              `Invalid environment variable assignment "${item}". Expected KEY=VALUE format.`,
            );
          }
          const key = item.slice(0, eqIdx).trim();
          const val = item.slice(eqIdx + 1);
          if (!key) {
            throw new Error(`Empty key in assignment "${item}".`);
          }
          body.env[key] = val;
        }
      }

      if (Object.keys(body).length === 0) {
        throw new Error(
          "No settings provided. Usage: eda set -a <appId> [--memory <mem>] [--cpus <cpus>] [--port <port>] [--name <name>] [--pre-deploy <cmd>] [--health-check <path>] [-v <host:dest>] [-e <KEY=VALUE>] [--env-file <path>]",
        );
      }

      const app = await api<App>(`/api/apps/${encodeURIComponent(appId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      const meta = app.metadata ?? {};
      const resLimits = (meta.resources ?? {}) as Record<string, any>;

      console.log(
        `\n${colors.green("✔")} Configuration updated for application ${colors.cyan(app.name)} (${colors.bold(app.id)}):\n`,
      );
      if (body.memory !== undefined) {
        console.log(
          `  Memory Limit : ${colors.cyan(resLimits.memory ?? "unlimited")}`,
        );
      }
      if (body.cpus !== undefined) {
        console.log(
          `  CPU Limit    : ${colors.cyan(resLimits.cpus ?? "unlimited")}`,
        );
      }
      if (body.port !== undefined) {
        console.log(`  Port         : ${colors.cyan(String(app.port))}`);
      }
      if (body.name !== undefined) {
        console.log(`  Name         : ${colors.cyan(app.name)}`);
      }
      if (body.preDeploy !== undefined) {
        const displayHook =
          body.preDeploy.length > 0 ? body.preDeploy.join(" && ") : "(none)";
        console.log(`  Pre-Deploy   : ${colors.cyan(displayHook)}`);
      }
      if (body.healthCheck !== undefined) {
        console.log(
          `  Health Check : ${colors.cyan(body.healthCheck ?? "(disabled)")}`,
        );
      }
      if (body.volumes !== undefined) {
        const volDesc =
          body.volumes && Object.keys(body.volumes).length > 0
            ? Object.entries(body.volumes)
                .map(([h, c]) => `${h}:${c}`)
                .join(", ")
            : "(none)";
        console.log(`  Volumes      : ${colors.cyan(volDesc)}`);
      }
      if (body.env !== undefined) {
        console.log(
          `  Environment  : ${colors.cyan(`${Object.keys(body.env).length} variable(s) encrypted & updated`)}`,
        );
      }
      console.log(
        `\n  ${colors.dim("Settings persist across future deployments.")}\n`,
      );
      break;
    }

    case "create": {
      throw new Error(
        "Direct app creation is not required. Run 'explita deploy -n <name>' to automatically create and deploy an application.",
      );
    }

    case "info": {
      const { appId } = parseAppCommand(args.slice(1), "app info");
      const result = await api<App>(`/api/apps/${encodeURIComponent(appId)}`);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "rm": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          app: { type: "string", short: "a" },
          yes: { type: "boolean", short: "y" },
          help: { type: "boolean", short: "h" },
        },
        allowPositionals: true,
      });

      if (values.help) {
        printCmdAndDec({
          product: `${PRODUCT_NAME.deploy} Remove`,
          desc: "Delete an application and its resources",
          usage: "eda rm -a <appId> [options]",
          commands: [
            ["eda rm -a <appId> [options]", "Delete an application"],
            ["explita deploy rm -a <appId> [options]", "Full command alias"],
          ],
          options: [
            ["-a, --app <appId>", "Target application ID (required)"],
            ["-y, --yes", "Bypass confirmation prompt and delete immediately"],
            ["-h, --help", "Show help"],
          ],
        });
        return;
      }

      const appId = values.app?.trim();
      if (!appId) {
        throw new Error(
          "Application ID is required to delete an application. Specify -a/--app <appId> explicitly (e.g. explita deploy app rm -a <appId>).",
        );
      }

      let appName: string | null = null;
      try {
        const app = await api<App>(`/api/apps/${encodeURIComponent(appId)}`);
        if (app?.name) {
          appName = app.name;
        }
      } catch {
        // Continue if app lookup fails; deletion call will handle existence/errors
      }

      const appLabel = appName ? `"${appName}" (${appId})` : `"${appId}"`;

      if (!values.yes) {
        if (!input.isTTY) {
          throw new Error(
            `Cannot prompt for confirmation in a non-interactive environment. Specify -y/--yes to confirm deleting application ${appLabel}.`,
          );
        }

        console.log(`
${colors.yellow("WARNING:")} This action is permanent and cannot be undone!
Removing application ${colors.bold(appLabel)} deletes everything concerning it:
  • All running containers and built Docker images
  • All source code, build artifacts, and deployment files on disk
  • Managed PostgreSQL database and user role (if attached)
  • Managed Redis keys (if attached)
  • Environment variables and encrypted secrets
`);

        const confirmed = await askConfirm(
          `Are you sure you want to permanently delete this application? ${colors.dim("[y/N]")} `,
          false,
        );

        if (!confirmed) {
          console.log(
            `\n${colors.yellow("Operation cancelled.")} Application ${colors.bold(appLabel)} was not deleted.\n`,
          );
          return;
        }
      }

      await api(`/api/apps/${encodeURIComponent(appId)}`, { method: "DELETE" });
      console.log(
        `\n${colors.green("✔")} Application ${colors.bold(appLabel)} deleted.\n`,
      );

      try {
        const project = loadProjectConfig();
        const localAppId = project?.config.deploy?.appId?.trim();
        if (
          localAppId &&
          (localAppId === appId || (appName && localAppId === appName))
        ) {
          const newDeploy = { ...project!.config.deploy };
          delete newDeploy.appId;
          saveProjectConfig(
            { deploy: newDeploy },
            undefined,
            { replaceDeploy: true },
          );
          console.log(
            `${colors.green("✔")} Cleaned up local ${PROJECT_CONFIG_FILENAME} (removed deleted appId).\n`,
          );
        }
      } catch {
        // Non-fatal if local config update fails
      }
      break;
    }

    default:
      printAppHelp();
      if (subCommand && subCommand !== "--help" && subCommand !== "-h") {
        throw new Error(`Unknown app subcommand: ${subCommand}`);
      }
      break;
  }
}

function envSetHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Set Settings`,
    desc: "Update application resource limits and runtime settings",
    usage: "eda set [options]",
    commands: [
      [
        "eda set [options]",
        "Apply resource limits or hook settings to application",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from config)",
      ],
      [
        "-m, --memory <limit>",
        "Memory limit (e.g. 256m, 512m, 1g, 2g, or 0/none to clear)",
      ],
      [
        "-c, --cpus <limit>",
        "CPU allocation (e.g. 0.5, 1.0, 2, or 0/none to clear)",
      ],
      ["-p, --port <port>", "Container internal port"],
      ["-n, --name <name>", "Application name"],
      [
        "-P, --pre-deploy <cmd>",
        'Pre-deploy hook command (e.g. "npx prisma migrate deploy")',
      ],
      ["-N, --no-pre-deploy", "Clear configured pre-deploy hooks"],
      [
        "-H, --health-check <path>",
        "HTTP health check path before routing traffic (e.g. /health or /)",
      ],
      ["--no-health-check", "Disable HTTP health check before routing traffic"],
      [
        "-e, --env <KEY=VALUE>",
        "Set encrypted environment variable (repeatable)",
      ],
      ["--env-file <path>", "File path for environment variables (e.g. .env)"],
      ["-h, --help", "Show help"],
    ],
  });
}
