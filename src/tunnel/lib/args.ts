import { parseArgs } from "node:util";
import {
  MIN_SUBDOMAIN_LENGTH,
  MAX_SUBDOMAIN_LENGTH,
  isValidIpOrCidr,
  parseAllowedIps,
  loadTunnelProjectConfig,
  loadTunnelConfig,
  normalizeTunnelServerUrl,
} from "@explita/infra-protocol";
import { LOCAL_TUNNEL_SERVER_URL, TUNNEL_SERVER_URL } from "./constants.js";
import { printHelp } from "./print-help.js";

export interface AgentConfig {
  port: number;
  host?: string;
  target?: string;
  subdomain?: string;
  server?: string;
  token?: string;
  auth?: string;
  allowedIps?: string[];
  hostHeader?: string;
  reconnect?: boolean;
  encrypt?: boolean;
  inspect?: boolean | number;
  inspectUi?: boolean;
  inspectPort?: number;
}

export function parseCliArgs(args: string[]): AgentConfig {
  // Pre-process args: support "--inspect [port|true|false]", "--inspect=[...]", "--host-header [host]", and "-H"
  const normalizedArgs: string[] = [];
  let explicitInspectFromFlag: boolean | number | undefined = undefined;
  let explicitHostHeaderFromFlag: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === "--inspect") {
      const next = args[i + 1];
      if (next && /^\d+$/.test(next)) {
        explicitInspectFromFlag = Number(next);
        i++; // Consume port
      } else if (
        next &&
        (next.toLowerCase() === "false" ||
          next.toLowerCase() === "off" ||
          next.toLowerCase() === "no")
      ) {
        explicitInspectFromFlag = false;
        i++; // Consume false
      } else if (
        next &&
        (next.toLowerCase() === "true" ||
          next.toLowerCase() === "on" ||
          next.toLowerCase() === "yes")
      ) {
        explicitInspectFromFlag = true;
        i++; // Consume true
      } else {
        explicitInspectFromFlag = true;
      }
    } else if (current.startsWith("--inspect=")) {
      const rawVal = current.slice("--inspect=".length).trim();
      if (/^\d+$/.test(rawVal)) {
        explicitInspectFromFlag = Number(rawVal);
      } else if (
        rawVal.toLowerCase() === "false" ||
        rawVal.toLowerCase() === "off" ||
        rawVal.toLowerCase() === "no"
      ) {
        explicitInspectFromFlag = false;
      } else if (
        rawVal.toLowerCase() === "true" ||
        rawVal.toLowerCase() === "on" ||
        rawVal.toLowerCase() === "yes" ||
        rawVal === ""
      ) {
        explicitInspectFromFlag = true;
      } else {
        console.error(
          `Invalid value for --inspect: "${rawVal}". Expected port number, "true", or "false".`,
        );
        process.exit(1);
      }
    } else if (current === "-H" || current === "--host-header") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        explicitHostHeaderFromFlag = next;
        i++;
      } else {
        explicitHostHeaderFromFlag = "rewrite";
      }
    } else if (current.startsWith("--host-header=")) {
      explicitHostHeaderFromFlag =
        current.slice("--host-header=".length).trim() || "rewrite";
    } else {
      normalizedArgs.push(current);
    }
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: normalizedArgs,
      allowPositionals: true,
      options: {
        port: {
          type: "string",
          short: "p",
        },
        subdomain: {
          type: "string",
          short: "s",
        },
        server: {
          type: "string",
          short: "S",
        },
        local: {
          type: "boolean",
          short: "l",
        },
        token: {
          type: "string",
          short: "t",
        },
        auth: {
          type: "string",
          short: "a",
        },
        "allow-ip": {
          type: "string",
          short: "i",
        },
        "host-header": {
          type: "string",
          short: "H",
        },
        host: {
          type: "string",
        },
        target: {
          type: "string",
        },
        "no-reconnect": {
          type: "boolean",
          short: "R",
        },
        "no-encrypt": {
          type: "boolean",
          short: "E",
        },
        "no-inspect": {
          type: "boolean",
        },
        help: {
          type: "boolean",
          short: "h",
        },
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // Load configuration sources (CLI flags > Env vars > Local explita.json > Global config > Defaults)
  const globalConfig = loadTunnelConfig();
  const repoConfigEntry = loadTunnelProjectConfig();
  const repoConfig = repoConfigEntry?.config;

  // 1. Resolve Port: CLI > Local config (explita.json)
  const portInput =
    values.port ||
    positionals[0] ||
    (repoConfig?.port != null ? String(repoConfig.port) : undefined);

  if (!portInput) {
    console.error(
      'Missing port.\nExample: eta 3000 (or define "port" under tunnel in explita.json)',
    );
    process.exit(1);
  }

  const resolvedPort = Number(portInput);

  if (
    !Number.isInteger(resolvedPort) ||
    resolvedPort < 1 ||
    resolvedPort > 65535
  ) {
    console.error(
      `Invalid port: "${portInput}".\nPort must be an integer between 1 and 65535.`,
    );
    process.exit(1);
  }

  // 2. Resolve Server: CLI > local flag > ENV (for CI) > Repo > Global > Default
  const rawServer =
    values.server ||
    (values.local ? LOCAL_TUNNEL_SERVER_URL : undefined) ||
    process.env.TUNNEL_SERVER_URL ||
    repoConfig?.server ||
    globalConfig?.server ||
    TUNNEL_SERVER_URL;

  const server = normalizeTunnelServerUrl(rawServer);

  // 3. Resolve Subdomain: CLI > Repo config
  const rawSubdomain = values.subdomain || repoConfig?.subdomain;

  let subdomain = rawSubdomain?.trim().toLowerCase();
  if (subdomain) {
    if (
      subdomain.length < MIN_SUBDOMAIN_LENGTH ||
      subdomain.length > MAX_SUBDOMAIN_LENGTH
    ) {
      console.error(
        `Invalid subdomain: "${subdomain}".\nSubdomain length must be between ${MIN_SUBDOMAIN_LENGTH} and ${MAX_SUBDOMAIN_LENGTH} characters.`,
      );
      process.exit(1);
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      console.error(
        `Invalid subdomain: "${subdomain}".\nSubdomains may only contain lowercase letters, numbers, and hyphens.`,
      );
      process.exit(1);
    }
  }

  // 4. Resolve Auth: CLI > Repo config
  const rawAuth = (values.auth as string | undefined) || repoConfig?.auth;

  let auth: string | undefined;
  if (rawAuth) {
    const colonIdx = rawAuth.indexOf(":");
    if (colonIdx <= 0 || colonIdx === rawAuth.length - 1) {
      console.error(
        `Invalid auth format: "${rawAuth}".\nPlease use "username:password" (e.g. -a "alice:secret").`,
      );
      process.exit(1);
    }
    auth = rawAuth;
  }

  // 5. Resolve Allowed IPs: CLI > Repo config
  const rawAllowIp =
    (values["allow-ip"] as string | undefined) || repoConfig?.allowIp;

  let allowedIps: string[] | undefined;
  if (rawAllowIp) {
    const parsed = parseAllowedIps(rawAllowIp);
    for (const rule of parsed) {
      if (!isValidIpOrCidr(rule)) {
        console.error(
          `Invalid IP or CIDR rule: "${rule}".\nPlease provide valid IPv4, IPv6, or CIDR subnets (e.g. -i "1.2.3.4, 10.0.0.0/8").`,
        );
        process.exit(1);
      }
    }
    if (parsed.length > 0) {
      allowedIps = parsed;
    }
  }

  // 6. Resolve Host Header: CLI > Repo config
  const rawHostHeader =
    explicitHostHeaderFromFlag ||
    (values["host-header"] as string | undefined) ||
    (typeof repoConfig?.hostHeader === "boolean"
      ? repoConfig.hostHeader
        ? "rewrite"
        : undefined
      : repoConfig?.hostHeader);

  let hostHeader: string | undefined = undefined;
  if (rawHostHeader) {
    const trimmed = String(rawHostHeader).trim();
    if (
      trimmed.toLowerCase() === "rewrite" ||
      trimmed.toLowerCase() === "target" ||
      trimmed.toLowerCase() === "localhost" ||
      trimmed.toLowerCase() === "true"
    ) {
      hostHeader = "rewrite";
    } else if (trimmed.toLowerCase() !== "false") {
      hostHeader = trimmed;
    }
  }

  // 7. Resolve Token: CLI > ENV (for CI/CD) > Global config
  const token = values.token || process.env.TUNNEL_TOKEN || globalConfig?.token;

  // 8. Resolve Reconnect: CLI > Repo > Global > Default (true)
  let reconnect = true;
  if (values["no-reconnect"] !== undefined) {
    reconnect = !values["no-reconnect"];
  } else if (repoConfig?.reconnect !== undefined) {
    reconnect = Boolean(repoConfig.reconnect);
  } else if (globalConfig?.reconnect !== undefined) {
    reconnect = Boolean(globalConfig.reconnect);
  }

  // 9. Resolve Encrypt: CLI > Repo > Global > Default (true)
  let encrypt = true;
  if (values["no-encrypt"] !== undefined) {
    encrypt = !values["no-encrypt"];
  } else if (repoConfig?.encrypt !== undefined) {
    encrypt = Boolean(repoConfig.encrypt);
  } else if (globalConfig?.encrypt !== undefined) {
    encrypt = Boolean(globalConfig.encrypt);
  }

  // 10. Resolve Inspect UI & Port: CLI > Local config > Global > Default (UI: true, Port: default)
  let inspect: boolean | number = true;
  let inspectPort: number | undefined = undefined;

  // Check repo / global inspect settings
  const configInspect = repoConfig?.inspect ?? globalConfig?.inspect;
  if (configInspect !== undefined) {
    if (typeof configInspect === "boolean") {
      inspect = configInspect;
    } else if (typeof configInspect === "number") {
      inspect = configInspect;
      inspectPort = configInspect;
    } else if (typeof (configInspect as unknown) === "string") {
      const trimmed = (configInspect as unknown as string).trim();
      if (trimmed.toLowerCase() === "false") {
        inspect = false;
      } else if (trimmed.toLowerCase() === "true" || trimmed === "") {
        inspect = true;
      } else if (/^\d+$/.test(trimmed)) {
        inspect = Number(trimmed);
        inspectPort = Number(trimmed);
      }
    }
  }

  // CLI overrides
  if (values["no-inspect"] !== undefined) {
    inspect = !values["no-inspect"];
    inspectPort = undefined;
  } else if (explicitInspectFromFlag !== undefined) {
    inspect = explicitInspectFromFlag;
    inspectPort =
      typeof explicitInspectFromFlag === "number"
        ? explicitInspectFromFlag
        : undefined;
  }

  const inspectUi = inspect === true || typeof inspect === "number";

  return {
    port: resolvedPort,
    host: (values.host as string | undefined) || repoConfig?.host,
    target: (values.target as string | undefined) || repoConfig?.target,
    subdomain,
    server,
    token,
    auth,
    allowedIps,
    hostHeader,
    reconnect,
    encrypt,
    inspect,
    inspectUi,
    inspectPort,
  };
}
