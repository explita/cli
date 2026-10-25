import { parseArgs } from "node:util";
import { isValidIpOrCidr, parseAllowedIps } from "@explita/infra-protocol";
import {
  getGlobalConfigPath as getConfigPath,
  loadTunnelConfig as loadUserConfig,
  saveTunnelConfig as saveUserConfig,
  type TunnelConfig as UserConfig,
  getProjectConfigPath,
  loadTunnelProjectConfig,
  saveTunnelProjectConfig,
  type TunnelProjectConfig,
  PROJECT_CONFIG_FILENAME,
  colors,
  PRODUCT_NAME,
  normalizeTunnelServerUrl,
} from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printTunnelConfigHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.tunnel} Config`,
    desc: "Manage local and global configuration",
    usage: "eta config [command] [options]",
    commands: [
      ["eta config", "List all active configuration"],
      ["eta config list", "List global and repo configuration"],
      ["eta config get <key>", "Get value for key"],
      ["eta config set <key> <val> [options]", "Set configuration value"],
      ["eta config path", "Show config file locations"],
    ],
    options: [
      ["--repo", `Force saving to local ${PROJECT_CONFIG_FILENAME}`],
      ["--global", "Force saving to global ~/.explita/config.json"],
      ["-h, --help", "Show help"],
    ],
    footerNote: `Configuration keys:
  • Repo keys (${PROJECT_CONFIG_FILENAME}): port, subdomain, auth, allowIp, hostHeader
  • Global keys (config.json): token, email, server
  • Shared keys: reconnect, encrypt, inspect`,
  });
}

function castValue(key: string, rawVal: string): any {
  if (rawVal.toLowerCase() === "true") return true;
  if (rawVal.toLowerCase() === "false") return false;
  if (key === "server") {
    return normalizeTunnelServerUrl(rawVal);
  }
  if (key === "port" || (!isNaN(Number(rawVal)) && /^\d+$/.test(rawVal))) {
    return Number(rawVal);
  }
  if (key === "allowIp" || key === "allow-ip") {
    const parsed = parseAllowedIps(rawVal);
    for (const rule of parsed) {
      if (!isValidIpOrCidr(rule)) {
        console.error(
          `Invalid IP or CIDR rule: "${rule}".\nPlease provide valid IPv4, IPv6, or CIDR subnets (e.g. "1.2.3.4, 10.0.0.0/8").`,
        );
        process.exit(1);
      }
    }
    return parsed.length === 1 ? parsed[0] : parsed;
  }
  return rawVal;
}

export async function runConfigCommand(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        repo: { type: "boolean" },
        global: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printTunnelConfigHelp();
    return;
  }

  const action = positionals[0]?.toLowerCase() || "list";

  if (action === "path") {
    const globalPath = getConfigPath();
    const repoPath = getProjectConfigPath();
    console.log(
      `\n${colors.bold("Global config:")} ${colors.cyan(globalPath)}`,
    );
    if (repoPath) {
      console.log(`${colors.bold("Repo config:")}   ${colors.cyan(repoPath)}`);
    } else {
      console.log(
        `${colors.bold("Repo config:")}   ${colors.dim(`None found in current directory (${PROJECT_CONFIG_FILENAME})`)}`,
      );
    }
    console.log();
    return;
  }

  if (action === "list") {
    const globalPath = getConfigPath();
    const globalConfig = loadUserConfig();
    const repoInfo = loadTunnelProjectConfig();

    console.log(
      `\n${colors.bold("Global Config")} ${colors.dim(`(${globalPath})`)}:`,
    );
    if (globalConfig && Object.keys(globalConfig).length > 0) {
      for (const [k, v] of Object.entries(globalConfig)) {
        if (k === "token" && typeof v === "string") {
          console.log(
            `  ${colors.dim(k)}: ${colors.yellow(v.slice(0, 8) + "...")}`,
          );
        } else {
          console.log(`  ${colors.dim(k)}: ${colors.cyan(String(v))}`);
        }
      }
    } else {
      console.log(`  ${colors.dim("(empty)")}`);
    }

    const repoPathDisplay = repoInfo
      ? repoInfo.path
      : `${PROJECT_CONFIG_FILENAME} (not created in current directory)`;
    console.log(
      `\n${colors.bold("Repo Config")} ${colors.dim(`(${repoPathDisplay})`)}:`,
    );
    if (repoInfo && Object.keys(repoInfo.config).length > 0) {
      for (const [k, v] of Object.entries(repoInfo.config)) {
        console.log(`  ${colors.dim(k)}: ${colors.cyan(String(v))}`);
      }
    } else {
      console.log(`  ${colors.dim("(none)")}`);
    }
    console.log();
    return;
  }

  if (action === "get") {
    let key = positionals[1];
    if (!key) {
      console.error("Missing key.\nUsage: eta config get <key>");
      process.exit(1);
    }
    if (key === "allow-ip") key = "allowIp";
    if (key === "host-header") key = "hostHeader";

    const repoInfo = loadTunnelProjectConfig();
    const globalConfig = loadUserConfig();

    let val: any;
    let source = "";

    if (repoInfo && (repoInfo.config as any)[key] !== undefined) {
      val = (repoInfo.config as any)[key];
      source = `repo: ${repoInfo.path}`;
    } else if (globalConfig && (globalConfig as any)[key] !== undefined) {
      val = (globalConfig as any)[key];
      source = "global";
    }

    if (val !== undefined) {
      console.log(`${val} ${colors.dim(`(${source})`)}`);
    } else {
      console.log(colors.dim(`Key "${key}" is not set.`));
    }
    return;
  }

  if (action === "set") {
    let key = positionals[1];
    const rawVal = positionals[2];

    if (!key || rawVal === undefined) {
      console.error(
        "Missing key or value.\nUsage: eta config set <key> <value>",
      );
      process.exit(1);
    }

    if (key === "allow-ip") key = "allowIp";
    if (key === "host-header") key = "hostHeader";

    const value = castValue(key, rawVal);

    // Repo keys must not be stored globally
    const isRepoSpecificKey = [
      "port",
      "subdomain",
      "auth",
      "allowIp",
      "hostHeader",
    ].includes(key);

    if (isRepoSpecificKey) {
      if (values.global) {
        console.log(
          colors.yellow(
            `\nNotice: "${key}" is project-specific and should not be saved globally to avoid port/subdomain collisions.`,
          ),
        );
        console.log(
          colors.dim(
            `Saving to local project config (${PROJECT_CONFIG_FILENAME}) instead.\n`,
          ),
        );
      }
      const res = saveTunnelProjectConfig({
        [key]: value,
      } as Partial<TunnelProjectConfig>);
      console.log(
        `${colors.green("✓")} Set ${colors.bold(key)} = ${colors.cyan(String(value))} in ${colors.dim(res.path)}`,
      );
      return;
    }

    if (values.repo) {
      const res = saveTunnelProjectConfig({
        [key]: value,
      } as Partial<TunnelProjectConfig>);
      console.log(
        `${colors.green("✓")} Set ${colors.bold(key)} = ${colors.cyan(String(value))} in ${colors.dim(res.path)}`,
      );
      return;
    }

    // Default to global for global/shared keys
    saveUserConfig({ [key]: value } as Partial<UserConfig>);
    console.log(
      `${colors.green("✓")} Set ${colors.bold(key)} = ${colors.cyan(String(value))} in global config (${colors.dim(getConfigPath())})`,
    );
    return;
  }

  console.error(
    `Unknown config action: "${action}".\nRun "eta config --help" for usage.`,
  );
  process.exit(1);
}
