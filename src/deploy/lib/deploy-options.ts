import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  loadProjectConfig,
  normalizePreDeploy,
  normalizeHealthCheck,
  normalizeCrons,
  normalizeVolumes,
  normalizeDomains,
  parseEnvFile,
  colors,
} from "@explita/infra-protocol";
import type {
  CronJobConfig,
  NotificationConfig,
} from "@explita/infra-protocol/deploy";
import { detectProjectPort } from "./detect.js";
import { hasDockerfile } from "./archive.js";

export function normalizeDeployArgs(args: string[]): {
  normalizedArgs: string[];
  explicitTunnel?: boolean;
} {
  const normalizedArgs: string[] = [];
  let explicitTunnel: boolean | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--clone-db") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        normalizedArgs.push(`--clone-db=${next}`);
        i++;
      } else {
        normalizedArgs.push("--clone-db=true");
      }
    } else if (arg === "--tunnel=false" || arg === "-t=false") {
      explicitTunnel = false;
    } else if (arg === "--tunnel=true" || arg === "-t=true") {
      explicitTunnel = true;
    } else if (arg === "--tunnel" || arg === "-t") {
      const next = args[i + 1]?.toLowerCase();
      if (next === "false" || next === "0" || next === "off" || next === "no") {
        explicitTunnel = false;
        i++;
      } else if (
        next === "true" ||
        next === "1" ||
        next === "on" ||
        next === "yes"
      ) {
        explicitTunnel = true;
        i++;
      } else {
        explicitTunnel = true;
      }
    } else if (arg === "--no-tunnel") {
      explicitTunnel = false;
    } else {
      normalizedArgs.push(arg);
    }
  }

  return { normalizedArgs, explicitTunnel };
}

export interface ResolvedDeployOptions {
  explicitAppId?: string;
  targetAppId?: string;
  name?: string;
  port?: number;
  domains: string[];
  cliDomains?: string[];
  subdomain?: string;
  tag?: string;
  isPreview: boolean;
  tunnelPreference?: boolean;
  preDeployPreference?: string[];
  healthCheckPreference?: string | null;
  cronsPreference?: CronJobConfig[];
  volumesPreference?: Record<string, string> | null;
  notifyPreference?: NotificationConfig;
  envMap: Record<string, string>;
  hasInlineEnvs: boolean;
  cloneDbPreference?: string;
  previewAuthPreference?: string;
  force?: boolean;
  noWait?: boolean;
  purge?: boolean;
}

export function resolveDeployOptions(args: string[]): ResolvedDeployOptions {
  const { normalizedArgs, explicitTunnel } = normalizeDeployArgs(args);

  const { values } = parseArgs({
    args: normalizedArgs,
    options: {
      app: { type: "string", short: "a" },
      name: { type: "string", short: "n" },
      port: { type: "string", short: "p" },
      tag: { type: "string" },
      domain: { type: "string", multiple: true, short: "d" },
      subdomain: { type: "string", short: "s" },
      tunnel: { type: "boolean", short: "t" },
      "health-check": { type: "string", short: "c" },
      "no-health-check": { type: "boolean", short: "H" },
      "pre-deploy": { type: "string", multiple: true, short: "P" },
      "no-pre-deploy": { type: "boolean", short: "N" },
      volume: { type: "string", multiple: true, short: "v" },
      env: { type: "string", multiple: true, short: "e" },
      "env-file": { type: "string" },
      "no-wait": { type: "boolean", default: false, short: "w" },
      preview: { type: "boolean" },
      auth: { type: "string" },
      purge: { type: "boolean" },
      "clone-db": { type: "string" },
      force: { type: "boolean", short: "f" },
    },
  });

  const projectConfig = loadProjectConfig()?.config;
  const projectDeployConfig = projectConfig?.deploy;
  const rawCrons = projectDeployConfig?.crons;
  const cronsPreference =
    rawCrons !== undefined ? normalizeCrons(rawCrons) : undefined;

  const rawVolumes = values.volume?.length
    ? values.volume
    : projectDeployConfig?.volumes;
  const volumesPreference =
    rawVolumes !== undefined ? normalizeVolumes(rawVolumes) : undefined;

  const tunnelPreference =
    explicitTunnel !== undefined
      ? explicitTunnel
      : values.tunnel !== undefined
        ? Boolean(values.tunnel)
        : projectDeployConfig?.tunnel;

  let preDeployPreference: string[] | undefined;
  if (values["no-pre-deploy"]) {
    preDeployPreference = [];
  } else if (values["pre-deploy"]) {
    preDeployPreference = normalizePreDeploy(values["pre-deploy"]);
  } else if (projectDeployConfig?.preDeploy !== undefined) {
    preDeployPreference = normalizePreDeploy(projectDeployConfig.preDeploy);
  }

  let healthCheckPreference: string | null | undefined;
  if (values["no-health-check"]) {
    healthCheckPreference = null;
  } else if (values["health-check"] !== undefined) {
    healthCheckPreference = normalizeHealthCheck(values["health-check"] || "/");
  } else if (projectDeployConfig?.healthCheck !== undefined) {
    healthCheckPreference = normalizeHealthCheck(
      projectDeployConfig.healthCheck,
    );
  }

  const envMap: Record<string, string> = {};

  if (values["env-file"]) {
    const filePath = resolve(process.cwd(), values["env-file"] as string);
    try {
      const fromFile = parseEnvFile(filePath);
      Object.assign(envMap, fromFile);
    } catch (err: any) {
      throw new Error(`Failed to read env file "${filePath}": ${err.message}`);
    }
  }

  if (values.env && values.env.length > 0) {
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
      envMap[key] = val;
    }
  }

  const hasInlineEnvs = Object.keys(envMap).length > 0;

  if (!hasDockerfile()) {
    throw new Error(
      "No Dockerfile found in current directory. Explita Deploy requires a Dockerfile to build and run your application.",
    );
  }

  const isPreview = Boolean(values.preview);
  let port = values.port ? Number(values.port) : projectDeployConfig?.port;
  if (!port) {
    const detected = detectProjectPort(process.cwd());
    if (detected) {
      port = detected;
      console.log(
        `${colors.cyan("ℹ")} Auto-detected port ${colors.bold(String(port))} from project configuration`,
      );
    }
  }

  const rawCliDomains = values.domain;
  const configDomains = projectDeployConfig?.domains;
  const domains =
    !isPreview && rawCliDomains && rawCliDomains.length > 0
      ? normalizeDomains(rawCliDomains)
      : normalizeDomains(configDomains);

  const explicitAppId = values.app?.trim();
  const targetAppId = explicitAppId || projectDeployConfig?.appId?.trim();
  const notifyPreference = projectDeployConfig?.notify;

  const cloneDbPreference = values["clone-db"];
  if (cloneDbPreference && !isPreview) {
    throw new Error(
      "Cannot use --clone-db without --preview. Database cloning is only available for preview deployments.",
    );
  }

  const rawPreviewAuth = values.auth || projectDeployConfig?.preview?.auth;
  let previewAuthPreference: string | undefined;
  if (rawPreviewAuth) {
    const colonIdx = rawPreviewAuth.indexOf(":");
    if (colonIdx <= 0 || colonIdx === rawPreviewAuth.length - 1) {
      throw new Error(
        `Invalid preview auth format: "${rawPreviewAuth}". Please use "username:password" (e.g. --auth "admin:secret").`,
      );
    }
    previewAuthPreference = rawPreviewAuth.trim();
  }

  if (previewAuthPreference && !isPreview) {
    throw new Error(
      "Cannot use --auth without --preview. Basic Auth is only available for preview deployments.",
    );
  }

  const tagPreference = values.tag?.trim() || projectDeployConfig?.tag;
  const name = values.name || projectDeployConfig?.name;

  return {
    explicitAppId,
    targetAppId,
    name,
    port,
    domains,
    cliDomains: rawCliDomains,
    subdomain: values.subdomain,
    tag: tagPreference,
    isPreview,
    tunnelPreference,
    preDeployPreference,
    healthCheckPreference,
    cronsPreference,
    volumesPreference,
    notifyPreference,
    envMap,
    hasInlineEnvs,
    cloneDbPreference,
    previewAuthPreference,
    force: values.force,
    noWait: values["no-wait"],
    purge: values.purge,
  };
}
