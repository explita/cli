import type { App, Deployment } from "../types.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  api,
  baseUrl,
  authToken,
  handleFetchError,
  setSessionAuth,
} from "../lib/api.js";
import {
  createTarball,
  computeSourceHash,
  hasDockerfile,
} from "../lib/archive.js";
import { streamDeployment } from "../lib/stream.js";
import { runAppCommand } from "./app.js";
import { runDomainCommand } from "./domain.js";
import { runTunnelCommand } from "./tunnel.js";
import { runLifecycleCommand } from "./lifecycle.js";
import { runLogsCommand } from "./logs.js";
import { runRollbackCommand } from "./rollback.js";
import { runDeploymentsCommand } from "./deployments.js";
import { runConfigCommand } from "./config.js";
import { runDbCommand } from "./db.js";
import { runRedisCommand } from "./redis.js";
import { runEnvCommand } from "./env.js";
import { runExecCommand } from "./exec.js";
import { runShCommand } from "./sh.js";
import { runPruneCommand } from "./prune.js";
import { runVolumeCommand } from "./volume.js";
import { runStatsCommand } from "./stats.js";
import { runCronCommand } from "./cron.js";
import { runDumpCommand } from "./dump.js";
import { runNotifyCommand } from "./notify.js";
import { runDeployInitCommand } from "./init.js";
import { runMaintenanceCommand } from "./maintenance.js";
import { runPromoteCommand } from "./promote.js";
import { runS3Command } from "./s3.js";
import { runCancelCommand } from "./cancel.js";
import { runDoctorCommand } from "./doctor.js";
import { runCompletionCommand } from "../../lib/completion/index.js";
import { maybeNotifyAvailableUpdates } from "../lib/version-check.js";
import { askConfirm } from "../../lib/prompt.js";
import {
  resolveDeployOptions,
  normalizeDeployArgs,
} from "../lib/deploy-options.js";
import {
  resolveOrCreateDeployApp,
  hasConfigChanges,
} from "../lib/deploy-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import { askPreviewAction, PreviewAction } from "../lib/confirm.js";

function printDeployHelp(): void {
  printCmdAndDec({
    product: PRODUCT_NAME.deploy,
    desc: "Application deployment and management",
    commands: [
      ["explita deploy [options]", "Deploy application (alias: eda)"],
      ["eda [options]", "Shorthand deployment"],
      [
        `eda ${colors.cyan("init")} [-n <name>] [-p <port>] [-d <domain>]`,
        "Initialize project config (explita.json)",
      ],
      [`eda ${colors.cyan("ls")} [-s <query>]`, "List applications"],
      [`eda ${colors.cyan("info")} [-a <appId>]`, "Get application details"],
      [
        `eda ${colors.cyan("set")} [-a <appId>] [--memory <mem>] [--cpus <cpus>]`,
        "Update container resource limits (memory/CPUs)",
      ],
      [`eda ${colors.cyan("rm")} [-a <appId>] [-y]`, "Delete an application"],
      [
        `eda ${colors.cyan("sh")} [-a <appId>]`,
        "Interactive remote shell (alias: shell)",
      ],
      [
        `eda ${colors.cyan("exec")} [-a <appId>] -- <cmd...>`,
        "Run one-off command (alias: run, exec -it)",
      ],
      [
        `eda ${colors.cyan("domain")} <add|rm|ls|check>`,
        "Manage custom domains, SSL certificates & routing",
      ],
      [
        `eda ${colors.cyan("tunnel")} <enable|disable> [-a <appId>]`,
        "Manage automated public HTTPS tunnel",
      ],
      [
        `eda ${colors.cyan("env")} <set|ls|rm|pull> [-a <appId>]`,
        "Manage encrypted environment variables & secrets",
      ],
      [
        `eda ${colors.cyan("start")} [-a <appId>]`,
        "Start stopped application container",
      ],
      [
        `eda ${colors.cyan("stop")} [-a <appId>]`,
        "Stop running application container",
      ],
      [
        `eda ${colors.cyan("restart")} [-a <appId>]`,
        "Restart application container",
      ],
      [
        `eda ${colors.cyan("logs")} [-a <appId>] [--live] [--tail <N>]`,
        "View or stream container runtime logs",
      ],
      [
        `eda ${colors.cyan("rollback")} <deploymentId>`,
        "Roll back to a previous successful deployment",
      ],
      [
        `eda ${colors.cyan("promote")} <deploymentId>`,
        "Promote preview deployment to production",
      ],
      [
        `eda ${colors.cyan("cancel")} <deploymentId>`,
        "Cancel active deployment and clean up resources",
      ],
      [
        `eda ${colors.cyan("history")} [-a <appId>]`,
        "View deployment history and audit trail",
      ],
      [
        `eda ${colors.cyan("stats")} [-a <appId>] [--all] [-l]`,
        "Container resource usage snapshot/stream",
      ],
      [
        `eda ${colors.cyan("top")} [-a <appId>] [--all]`,
        "Live container resource dashboard",
      ],
      [
        `eda ${colors.cyan("cron")} <ls|run|history> [-a <appId>]`,
        "Scheduled background jobs (cron)",
      ],
      [
        `eda ${colors.cyan("db")} <create|url|dump|restore|rm> [-a <appId>]`,
        "Manage PostgreSQL databases, credentials & backups",
      ],
      [
        `eda ${colors.cyan("redis")} <create|url|rm> [-a <appId>]`,
        "Manage isolated Redis instances",
      ],
      [
        `eda ${colors.cyan("dump")} [-a <appId>] [-d] [-f] [-e] [--reveal-secrets] [--s3] [-o <file>]`,
        "Export compressed backup",
      ],
      [
        `eda ${colors.cyan("s3")} [status|set|test|rm] [-a <appId>]`,
        "Off-site S3 / Cloudflare R2 backup & dump replication",
      ],
      [
        `eda ${colors.cyan("notify")} <ls|set|rm|test> [-a <appId>]`,
        "Incident & health alerts (Discord/Telegram/Slack)",
      ],
      [
        `eda ${colors.cyan("maintenance")} <on|off|status> [-a <appId>]`,
        "Instant 503 maintenance mode (alias: mm)",
      ],
      [
        `eda ${colors.cyan("prune")} [--all]`,
        "VPS disk hygiene & Docker maintenance",
      ],
      [
        `eda ${colors.cyan("volume")} <ls|inspect> [-a <appId>]`,
        "Inspect persistent Docker volumes & storage mounts",
      ],
      [
        `eda ${colors.cyan("config")} <ls|get|set|path>`,
        "Manage CLI global configuration and settings",
      ],
      [
        `eda ${colors.cyan("doctor")}`,
        "Pre-flight system diagnostics & project validation",
      ],
      [
        `eda ${colors.cyan("completion")} <bash|zsh|pwsh>`,
        "Generate shell tab-completion script",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (auto-resolved from explita.json if present)",
      ],
      [
        "-n, --name <name>",
        "Application name (required for initial app creation)",
      ],
      [
        "-p, --port <port>",
        "Container port (optional, auto-detected from Dockerfile)",
      ],
      [
        "-d, --domain <domain>",
        "Attach custom domain (repeatable; mapped to preview when using --preview)",
      ],
      [
        "-s, --subdomain <subdomain>",
        "Custom tunnel subdomain or preview prefix",
      ],
      [
        "-t, --tunnel [bool]",
        "Create automated public HTTPS tunnel for this application (default: true for new apps; pass --tunnel=false to disable)",
      ],
      [
        "--tag <tag>",
        "Tag for this deployment (defaults to 'main' for initial deployment)",
      ],
      [
        "--preview",
        "Deploy to private preview tunnel before promoting to production",
      ],
      [
        "--clone-db [key|keys|all]",
        "Clone database for preview (default: default, comma-separated keys, or 'all')",
      ],
      [
        "--auth <user:pass>",
        "Protect preview with HTTP Basic Authentication (e.g. 'admin:secret')",
      ],
      ["--purge", "Permanently purge preview deployment record if discarded"],
      [
        "-f, --force",
        "Force re-deployment even if no code or configuration changes are detected",
      ],
      [
        "-c, --health-check <path>",
        'HTTP health check path before routing traffic (default: "/")',
      ],
      [
        "-H, --no-health-check",
        "Disable HTTP health check before routing traffic",
      ],
      [
        "-P, --pre-deploy <cmd>",
        'Pre-deploy hook command before swapping traffic (e.g. "npx prisma migrate deploy")',
      ],
      [
        "-N, --no-pre-deploy",
        "Skip pre-deploy hook configured in project config",
      ],
      [
        "-v, --volume <host:dest>",
        "Mount persistent Docker volume or host path (repeatable)",
      ],
      [
        "-e, --env <KEY=VALUE>",
        "Set encrypted environment variable(s) for deployment (repeatable)",
      ],
      [
        "--env-file <path>",
        "Path to file containing environment variables to inject (e.g. .env)",
      ],
      ["-w, --no-wait", "Do not wait for build/startup log stream"],
      [
        "--pass <pin>",
        "Passcode / PIN for server authentication (session-only, never saved)",
      ],
      ["--otp <code>", "6-digit TOTP 2FA code (Google Authenticator)"],
      ["-h, --help", "Show help"],
    ],
  });
}

export function extractAuthFlags(args: string[]): {
  cleanArgs: string[];
  pass?: string;
  otp?: string;
} {
  const cleanArgs: string[] = [];
  let pass: string | undefined;
  let otp: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pass") {
      pass = args[i + 1];
      i++;
    } else if (arg.startsWith("--pass=")) {
      pass = arg.slice("--pass=".length);
    } else if (arg === "--otp") {
      otp = args[i + 1];
      i++;
    } else if (arg.startsWith("--otp=")) {
      otp = arg.slice("--otp=".length);
    } else {
      cleanArgs.push(arg);
    }
  }

  return { cleanArgs, pass, otp };
}

export async function handleDeployCommand(rawArgs: string[]): Promise<void> {
  const { cleanArgs, pass, otp } = extractAuthFlags(rawArgs);
  if (pass || otp) {
    setSessionAuth({ pass, otp });
  }

  const args = cleanArgs;
  const first = args[0]?.toLowerCase();

  if (first === "--help" || first === "-h") {
    printDeployHelp();
    return;
  }

  try {
    switch (first) {
      case "ls":
      case "info":
      case "set":
      case "rm":
        return await runAppCommand(args);
      case "sh":
      case "shell":
        return await runShCommand(args.slice(1));
      case "exec":
      case "run":
        return await runExecCommand(args.slice(1));
      case "stats":
        return await runStatsCommand(args.slice(1));
      case "top":
        return await runStatsCommand(["--live", ...args.slice(1)]);
      case "domain":
        return await runDomainCommand(args.slice(1));
      case "tunnel":
        return await runTunnelCommand(args.slice(1));
      case "env":
        return await runEnvCommand(args.slice(1));
      case "db":
        return await runDbCommand(args.slice(1));
      case "redis":
        return await runRedisCommand(args.slice(1));
      case "start":
      case "stop":
      case "restart":
        return await runLifecycleCommand(first, args.slice(1));
      case "logs":
        return await runLogsCommand(args.slice(1));
      case "rollback":
        return await runRollbackCommand(args.slice(1));
      case "promote":
        return await runPromoteCommand(args.slice(1));
      case "cancel":
        return await runCancelCommand(args.slice(1));
      case "history":
        return await runDeploymentsCommand(args.slice(1));
      case "prune":
        return await runPruneCommand(args.slice(1));
      case "volume":
        return await runVolumeCommand(args.slice(1));
      case "cron":
      case "crons":
        return await runCronCommand(args.slice(1));
      case "dump":
        return await runDumpCommand(args.slice(1));
      case "s3":
        return await runS3Command(args.slice(1));
      case "config":
        return await runConfigCommand(args.slice(1));
      case "notify":
        return await runNotifyCommand(args.slice(1));
      case "maintenance":
      case "mm":
        return await runMaintenanceCommand(args.slice(1));
      case "init":
        return await runDeployInitCommand(args.slice(1));
      case "doctor":
        return await runDoctorCommand(args.slice(1));
      case "completion":
        return await runCompletionCommand(args.slice(1));
      default:
        return await runDeployCommand(args);
    }
  } finally {
    if (
      first !== "sh" &&
      first !== "shell" &&
      first !== "doctor" &&
      first !== "completion" &&
      !(first === "stats" && args.includes("--live")) &&
      !(first === "logs" && (args.includes("-f") || args.includes("--follow")))
    ) {
      maybeNotifyAvailableUpdates();
    }
  }
}

export { normalizeDeployArgs } from "../lib/deploy-options.js";

export async function runDeployCommand(args: string[]): Promise<void> {
  const opts = resolveDeployOptions(args);
  const currentSourceHash = await computeSourceHash(process.cwd());

  const appRecord = await resolveOrCreateDeployApp(opts, currentSourceHash);
  if (!appRecord) {
    return;
  }

  const deployment = await uploadDeploymentArchive(
    appRecord,
    opts.tunnelPreference,
    {
      preview: opts.isPreview,
      cloneDb: opts.cloneDbPreference,
      previewAuth: opts.previewAuthPreference,
      subdomain: opts.subdomain,
      domains: opts.isPreview ? opts.cliDomains : undefined,
      sourceHash: currentSourceHash,
      tag: opts.tag,
    },
  );

  if (opts.isPreview) {
    await handlePreviewDeployment(deployment, {
      noWait: opts.noWait,
      purge: opts.purge,
    });
  } else {
    if (!opts.noWait) {
      console.log(
        colors.dim(
          `Streaming deployment output for ${deployment.id}... (Ctrl+C to cancel)`,
        ),
      );
      const depResult = await streamDeployment(deployment.id);
      if ((depResult as any)?.status === "CANCELLED") {
        return;
      }
      await printAccessUrls(appRecord.id);
    } else {
      console.log(
        `\n${colors.cyan("ℹ")} Deployment ${colors.bold(deployment.id)} is ongoing in background.`,
      );
      console.log(`  App ID:      ${colors.cyan(appRecord.id)}`);
      console.log(
        `  View logs:   ${colors.cyan(`eda logs --deploy -a ${appRecord.id}`)}`,
      );
      console.log(
        `  To cancel:   ${colors.cyan(`eda cancel ${deployment.id}`)}\n`,
      );
    }
  }
}

async function handlePreviewDeployment(
  deployment: Deployment,
  options: { noWait?: boolean; purge?: boolean },
): Promise<void> {
  if (options.noWait) {
    console.log(
      `\n${colors.cyan("ℹ")} Preview deployment ${colors.bold(deployment.id)} is ongoing in background.`,
    );
    console.log(
      `  View logs:   ${colors.cyan(`eda logs --deploy -a ${deployment.appId}`)}`,
    );
    console.log(`  To cancel:   ${colors.cyan(`eda cancel ${deployment.id}`)}`);
    console.log(
      `  When live:   ${colors.cyan(`eda promote ${deployment.id}`)} (or discard with ${colors.cyan(`eda rollback ${deployment.id}`)}\n`,
    );
    return;
  }

  console.log(
    colors.dim(
      `Streaming preview deployment output for ${deployment.id}... (Ctrl+C to cancel)`,
    ),
  );
  const previewDep = await streamDeployment(deployment.id, {
    stopOnPreview: true,
  });

  if ((previewDep as any)?.status === "CANCELLED") {
    return;
  }

  const previewUrl =
    (previewDep as any)?.previewUrl ||
    ((previewDep as any)?.metadata?.previewUrl as string);
  const previewDomainUrls =
    ((previewDep as any)?.metadata?.previewDomainUrls as string[]) || [];

  if (previewUrl) {
    console.log(
      `\n${colors.green("✔")} ${colors.bold("Preview container is live at:")} ${colors.cyan(colors.bold(previewUrl))}`,
    );
  } else if (previewDomainUrls.length > 0) {
    console.log(
      `\n${colors.green("✔")} ${colors.bold("Preview container is live at:")} ${colors.cyan(colors.bold(previewDomainUrls[0]))}`,
    );
  }
  for (const dUrl of previewDomainUrls) {
    if (!previewUrl && dUrl === previewDomainUrls[0]) continue;
    console.log(
      `   ${colors.dim("•")} Custom domain: ${colors.cyan(colors.bold(dUrl))}`,
    );
  }

  const previewAuth =
    ((previewDep as any)?.metadata?.previewAuth as string) ||
    ((deployment as any)?.metadata?.previewAuth as string);
  if (previewAuth) {
    const user = previewAuth.split(":")[0];
    console.log(
      `   ${colors.dim("•")} ${colors.yellow("HTTP Basic Auth active")} (user: ${colors.bold(user)})`,
    );
  }
  console.log();

  if (!process.stdin.isTTY) {
    console.log(
      `Non-interactive terminal detected. Preview container remains active.\n` +
        `  Promote:  ${colors.cyan(`eda promote ${deployment.id}`)}\n` +
        `  Discard:  ${colors.cyan(`eda rollback ${deployment.id}`)}\n`,
    );
    return;
  }

  const action: PreviewAction = await askPreviewAction(
    `Promote to production? [y: promote, k: keep preview (default), d: discard]: `,
  );

  if (action === "promote") {
    console.log(
      `\n${colors.dim("Switching traffic to production (zero-downtime)...")}`,
    );
    const promoted = await api<Deployment>(
      `/api/deployments/${encodeURIComponent(deployment.id)}/promote`,
      { method: "POST" },
    );
    console.log(
      `\n${colors.green("✔")} ${colors.bold(`Deployment ${deployment.id} promoted to production!`)}`,
    );
    const promotedAppId = promoted?.appId || deployment.appId;
    if (promotedAppId) {
      console.log(`  App ID:  ${colors.cyan(promotedAppId)}`);
    }
    console.log();
    const tunnelUrl = promoted?.tunnelUrl;
    const domains = promoted?.domains || [];
    if (tunnelUrl || domains.length > 0) {
      console.log(colors.bold("Production Access URLs:"));
      if (tunnelUrl) {
        console.log(`  Tunnel:  ${colors.cyan(colors.bold(tunnelUrl))}`);
      }
      for (const dom of domains) {
        console.log(`  Custom:  ${colors.cyan(colors.bold(dom))}`);
      }
      console.log();
    }
  } else if (action === "discard") {
    let shouldPurge = options.purge;
    if (shouldPurge === undefined && process.stdin.isTTY) {
      shouldPurge = await askConfirm(
        "Permanently purge preview deployment record from history? [Y/n]: ",
        true,
      );
    }
    console.log(`\n${colors.dim("Discarding preview deployment...")}`);
    const query = shouldPurge ? "?purge=true" : "";
    await api(
      `/api/deployments/${encodeURIComponent(deployment.id)}/rollback${query}`,
      { method: "POST" },
    );
    if (shouldPurge) {
      console.log(
        `${colors.yellow("✔")} Preview container discarded and deployment record purged from history.\n`,
      );
    } else {
      console.log(
        `${colors.yellow("✔")} Preview container discarded cleanly. Zero production disruption.\n`,
      );
    }
  } else {
    // "keep" (default action when user exits, presses Enter, or answers no/keep)
    console.log(
      `\n${colors.cyan("ℹ")} Preview container remains active at:\n  ${colors.cyan(colors.bold(previewUrl))}\n`,
    );
    console.log(
      `When ready to promote to production:\n  ${colors.bold(`eda promote ${deployment.id}`)}\n`,
    );
    console.log(
      `To discard this preview container:\n  ${colors.bold(`eda rollback ${deployment.id}`)}\n`,
    );
  }
}

async function uploadDeploymentArchive(
  app: App,
  tunnelPreference?: boolean,
  options?: {
    preview?: boolean;
    cloneDb?: string | boolean;
    subdomain?: string;
    domains?: string[];
    previewAuth?: string;
    sourceHash?: string;
    tag?: string;
  },
): Promise<Deployment> {
  const cloneNotice = options?.cloneDb
    ? ` (${options.cloneDb === "true" || options.cloneDb === true ? "with cloned preview database" : `cloning database "${options.cloneDb}"`})`
    : "";
  console.log(
    `${colors.dim("Packaging local source for")} "${colors.bold(app.name)}"${cloneNotice}...`,
  );
  const tarball = await createTarball(process.cwd());
  const sizeMb = (tarball.length / (1024 * 1024)).toFixed(2);
  console.log(`${colors.dim("Uploading source archive")} (${sizeMb} MB)...`);

  const uploadUrl = new URL(
    `${baseUrl()}/api/apps/${encodeURIComponent(app.id)}/deploy`,
  );
  if (options?.sourceHash) {
    uploadUrl.searchParams.set("sourceHash", options.sourceHash);
  }
  if (options?.tag) {
    uploadUrl.searchParams.set("tag", options.tag);
  }
  if (tunnelPreference !== undefined) {
    uploadUrl.searchParams.set("tunnel", String(tunnelPreference));
  }
  if (options?.subdomain) {
    uploadUrl.searchParams.set("subdomain", options.subdomain);
  }
  if (options?.preview) {
    uploadUrl.searchParams.set("preview", "true");
    if (options.domains && options.domains.length > 0) {
      for (const d of options.domains) {
        uploadUrl.searchParams.append("domain", d);
      }
    }
  }
  if (options?.cloneDb) {
    uploadUrl.searchParams.set("cloneDb", String(options.cloneDb));
  }
  if (options?.previewAuth) {
    uploadUrl.searchParams.set("previewAuth", options.previewAuth);
  }

  let response: Response;
  try {
    response = await fetch(uploadUrl.toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${authToken()}`,
        "content-type": "application/gzip",
      },
      body: new Uint8Array(tarball),
    });
  } catch (err) {
    throw handleFetchError(err, baseUrl());
  }

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(data.error ?? `Upload failed (${response.status})`);
  }
  const deployment = (data?.data ?? data) as Deployment;

  console.log(
    `${colors.green("✔")} Deployment ${colors.bold(deployment.id)}${deployment.tag ? ` (${colors.cyan(deployment.tag)})` : ""} queued.`,
  );

  return deployment;
}

async function printAccessUrls(appId: string): Promise<void> {
  try {
    const app = await api<App>(`/api/apps/${encodeURIComponent(appId)}`);
    const meta = app?.metadata;
    const tunnelUrl = meta?.tunnel?.url as string | undefined;
    const domains = app?.domains?.map((d) => `https://${d.hostname}`) || [];

    if (tunnelUrl || domains.length > 0) {
      console.log(`\n${colors.bold("Access URLs:")}`);
      if (tunnelUrl) {
        console.log(`  Tunnel:  ${colors.cyan(colors.bold(tunnelUrl))}`);
      }
      for (const dom of domains) {
        console.log(`  Custom:  ${colors.cyan(colors.bold(dom))}`);
      }
      console.log();
    }
  } catch {
    // Ignore URL fetch failure
  }
}

export { hasConfigChanges } from "../lib/deploy-app.js";
