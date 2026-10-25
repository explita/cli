import {
  saveProjectConfig,
  PROJECT_CONFIG_FILENAME,
  colors,
} from "@explita/infra-protocol";
import { api } from "./api.js";
import { askConfirm } from "../../lib/prompt.js";
import type { App } from "../types.js";
import type { ResolvedDeployOptions } from "./deploy-options.js";

export function hasConfigChanges(
  app: App,
  current: {
    domains: string[];
    port?: number;
    tunnel?: boolean;
    preDeploy?: string[];
    healthCheck?: string | null;
    volumes?: Record<string, string> | null;
    subdomain?: string;
    hasEnvs?: boolean;
  },
): boolean {
  if (current.hasEnvs) {
    return true;
  }

  if (current.port !== undefined && current.port !== app.port) {
    return true;
  }

  const existingDomains = new Set(app.domains?.map((d) => d.hostname) || []);
  if (current.domains.some((d) => !existingDomains.has(d))) {
    return true;
  }

  if (
    current.tunnel !== undefined &&
    current.tunnel !==
      Boolean(app.metadata?.tunnel?.enabled ?? app.metadata?.tunnelEnabled)
  ) {
    return true;
  }

  if (
    current.subdomain !== undefined &&
    current.subdomain !== app.metadata?.tunnel?.subdomain
  ) {
    return true;
  }

  if (
    current.healthCheck !== undefined &&
    current.healthCheck !== (app.metadata?.healthCheck ?? null)
  ) {
    return true;
  }

  if (current.preDeploy !== undefined) {
    const existing = app.metadata?.preDeploy || [];
    if (JSON.stringify(current.preDeploy) !== JSON.stringify(existing)) {
      return true;
    }
  }

  if (current.volumes !== undefined) {
    const existing = app.metadata?.volumes || {};
    if (JSON.stringify(current.volumes) !== JSON.stringify(existing)) {
      return true;
    }
  }

  return false;
}

export async function resolveOrCreateDeployApp(
  opts: ResolvedDeployOptions,
  currentSourceHash: string,
): Promise<App | null> {
  let appRecord: App;

  if (opts.targetAppId) {
    const fetched = await api<App>(
      `/api/apps/${encodeURIComponent(opts.targetAppId)}`,
    ).catch(() => null);

    if (!fetched) {
      throw new Error(
        `Application with ID "${opts.targetAppId}" was not found on the server.`,
      );
    }

    appRecord = fetched;

    if (appRecord.currentDeployment) {
      const lastSourceHash = (appRecord.currentDeployment.metadata as any)
        ?.sourceHash as string | undefined;

      const configChanged = hasConfigChanges(appRecord, {
        domains: opts.domains,
        port: opts.port,
        tunnel: opts.tunnelPreference,
        preDeploy: opts.preDeployPreference,
        healthCheck: opts.healthCheckPreference,
        volumes: opts.volumesPreference,
        subdomain: opts.subdomain,
        hasEnvs: opts.hasInlineEnvs,
      });

      if (
        !configChanged &&
        lastSourceHash &&
        lastSourceHash === currentSourceHash
      ) {
        const depId = appRecord.currentDeployment.id;
        const actionVerb = opts.isPreview ? "preview" : "re-deploy";
        if (opts.force) {
          console.log(
            colors.dim(
              `No changes detected since deployment ${colors.bold(depId)}, forcing ${actionVerb} (--force)...`,
            ),
          );
        } else if (!process.stdin.isTTY) {
          console.log(
            `\n${colors.yellow("⚠")} No code or configuration changes detected since deployment ${colors.bold(depId)}. Aborting non-interactive run (use --force to override).\n`,
          );
          return null;
        } else {
          console.log(
            `\n${colors.yellow("⚠")} No code or configuration changes detected since deployment ${colors.bold(depId)}.`,
          );
          const confirmed = await askConfirm(
            `Do you want to ${actionVerb} anyway? [y/N]`,
            false,
          );
          if (!confirmed) {
            console.log(
              `${colors.dim(`Deployment cancelled. Use --force to ${actionVerb} without confirmation.`)}\n`,
            );
            return null;
          }
        }
      }
    }

    const shouldUpdate =
      (opts.port !== undefined && opts.port !== appRecord.port) ||
      opts.tunnelPreference !== undefined ||
      opts.subdomain !== undefined ||
      opts.preDeployPreference !== undefined ||
      opts.healthCheckPreference !== undefined ||
      opts.cronsPreference !== undefined ||
      opts.volumesPreference !== undefined ||
      opts.notifyPreference !== undefined ||
      opts.hasInlineEnvs;

    await Promise.all([
      !opts.isPreview && opts.domains.length > 0
        ? api(`/api/apps/${encodeURIComponent(appRecord.id)}/domains`, {
            method: "POST",
            body: JSON.stringify({ domains: opts.domains }),
          }).catch(() => null)
        : null,
      shouldUpdate
        ? api(`/api/apps/${encodeURIComponent(appRecord.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              port: opts.port,
              tunnel: opts.tunnelPreference,
              subdomain: opts.subdomain,
              preDeploy: opts.preDeployPreference,
              healthCheck: opts.healthCheckPreference,
              crons: opts.cronsPreference,
              volumes: opts.volumesPreference,
              notify: opts.notifyPreference,
              env: opts.hasInlineEnvs ? opts.envMap : undefined,
            }),
          })
            .then(() => {
              if (opts.port !== undefined && opts.port !== appRecord.port) {
                console.log(
                  `${colors.green("✔")} Updated port to ${colors.cyan(String(opts.port))} for ${colors.cyan(appRecord.name)}`,
                );
              }
              if (opts.hasInlineEnvs) {
                console.log(
                  `${colors.green("✔")} Encrypted & updated ${Object.keys(opts.envMap).length} environment variable(s) for ${colors.cyan(appRecord.name)}`,
                );
              }
            })
            .catch((err) => {
              if (opts.hasInlineEnvs) {
                console.log(
                  `${colors.yellow("⚠")} Warning: Failed to update environment variables: ${err.message}`,
                );
              }
            })
        : null,
    ]);
  } else {
    // New app creation requires name
    const name = opts.name;
    if (!name) {
      throw new Error(
        "Application name is required for new deployments: explita deploy -n <name> (or specify -a <appId> to deploy to an existing app).",
      );
    }

    console.log(`\n${colors.cyan("ℹ")} Creating "${colors.bold(name)}"...`);
    try {
      appRecord = await api<App>("/api/apps", {
        method: "POST",
        body: JSON.stringify({
          name,
          port: opts.port,
          domains: opts.domains,
          tunnel: opts.tunnelPreference ?? true,
          subdomain: opts.subdomain,
          preDeploy: opts.preDeployPreference,
          healthCheck: opts.healthCheckPreference,
          crons: opts.cronsPreference,
          volumes: opts.volumesPreference,
          notify: opts.notifyPreference,
          env: opts.hasInlineEnvs ? opts.envMap : undefined,
        }),
      });
      console.log(
        `${colors.green("✔")} Created application "${colors.bold(appRecord.name)}" ${colors.dim(`(ID: ${appRecord.id})`)}`,
      );
    } catch (err: any) {
      if (
        err?.message?.includes("already exists") ||
        err?.status === 409 ||
        err?.statusCode === 409
      ) {
        // App already exists (e.g. from an earlier failed initial deployment attempt)
        const apps = await api<App[]>("/api/apps").catch(() => []);
        const found = apps.find(
          (a) => a.name.toLowerCase() === name.toLowerCase(),
        );
        if (found) {
          appRecord = found;
          console.log(
            `${colors.cyan("ℹ")} Application "${colors.bold(name)}" already exists ${colors.dim(`(ID: ${appRecord.id})`)}. Resuming deployment...`,
          );
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (opts.hasInlineEnvs) {
      console.log(
        `${colors.green("✔")} Encrypted & configured ${Object.keys(opts.envMap).length} environment variable(s) for "${colors.bold(appRecord.name)}"`,
      );
    }

    // Auto-save appId to explita.json so subsequent runs automatically pin this app
    try {
      saveProjectConfig({ deploy: { name, appId: appRecord.id } });
      console.log(
        `${colors.green("✔")} Saved appId "${colors.cyan(appRecord.id)}" to ${PROJECT_CONFIG_FILENAME}\n`,
      );
    } catch {
      console.log(
        `${colors.dim(`ℹ Tip: Add "appId: '${appRecord.id}'" to the deploy section in ${PROJECT_CONFIG_FILENAME} to pin this app.\n`)}`,
      );
    }
  }

  if (opts.cronsPreference && opts.cronsPreference.length > 0) {
    console.log(
      `${colors.green("✔")} Configured ${colors.bold(String(opts.cronsPreference.length))} scheduled background job(s) (cron)`,
    );
  }

  if (
    opts.notifyPreference &&
    (opts.notifyPreference.discord ||
      opts.notifyPreference.slack ||
      opts.notifyPreference.telegram)
  ) {
    const channels = [
      opts.notifyPreference.discord ? "Discord" : null,
      opts.notifyPreference.slack ? "Slack" : null,
      opts.notifyPreference.telegram ? "Telegram" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `${colors.green("✔")} Configured incident & health alerts (${colors.bold(channels)})`,
    );
  }

  return appRecord;
}
