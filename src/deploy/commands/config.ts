import { parseArgs } from "node:util";
import {
  getGlobalConfigPath as getConfigPath,
  loadDeployConfig as loadConfig,
  saveDeployConfig as saveConfig,
  loadProjectConfig,
  getProjectConfigPath,
  saveProjectConfig,
  PROJECT_CONFIG_FILENAME,
  normalizeDomains,
  colors,
} from "@explita/infra-protocol";
import { PRODUCT_NAME } from "@explita/infra-protocol";

import { printCmdAndDec } from "../../lib/utils.js";

function printDeployConfigHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Config`,
    desc: "Manage global deploy configuration and view local project settings",
    commands: [
      ["eda config", "List active global and local project configuration"],
      ["eda config ls", "List active global and local project configuration"],
      [
        "eda config get <key>",
        "Get value for a key (server, token, name, port, appId, crons, etc.)",
      ],
      [
        "eda config set <key> <value>",
        "Set value for a key (server, token, name, port, appId, etc.)",
      ],
      ["eda config path", "Show global and project config file paths"],
    ],
    options: [["-h, --help", "Show help"]],
    footerNote: `Keys:
  • server   Global deploy server URL (e.g. http://localhost:39756)
  • token    Global deploy authentication token
  • name     Local project application name
  • port     Local project application port
  • appId    Local project bound application ID
  • crons    Local project scheduled background cron jobs`,
  });
}

export async function runConfigCommand(args: string[]): Promise<void> {
  const { positionals } = parseArgs({
    args,
    allowPositionals: true,
  });

  const subCommand = positionals[0]?.toLowerCase();

  switch (subCommand) {
    case undefined:
    case "ls": {
      const config = loadConfig() || {};
      const activeServer =
        process.env.EXPLITA_DEPLOY_SERVER ||
        config.server ||
        "(not configured)";
      const activeToken =
        process.env.EXPLITA_DEPLOY_TOKEN ||
        (config.token
          ? `${config.token.slice(0, 4)}...${config.token.slice(-4)}`
          : "(not configured)");

      console.log(`\n${colors.bold("Global config file:")} ${getConfigPath()}`);
      console.log(`  server  : ${colors.cyan(activeServer)}`);
      console.log(`  token   : ${colors.cyan(activeToken)}`);
      if (config.updatedAt) {
        console.log(`  updated : ${colors.dim(config.updatedAt)}`);
      }

      const projectEntry = loadProjectConfig();
      if (projectEntry) {
        console.log(
          `\n${colors.bold("Project config file:")} ${projectEntry.path}`,
        );
        const deployConf = projectEntry.config.deploy || {};
        if (deployConf.name)
          console.log(`  name        : ${colors.cyan(deployConf.name)}`);
        if (deployConf.appId)
          console.log(`  appId       : ${colors.cyan(deployConf.appId)}`);
        if (deployConf.port)
          console.log(
            `  port        : ${colors.cyan(String(deployConf.port))}`,
          );
        const domains = normalizeDomains(deployConf.domains);
        if (domains.length > 0)
          console.log(`  domains     : ${colors.cyan(domains.join(", "))}`);
        if (deployConf.tunnel !== undefined)
          console.log(
            `  tunnel      : ${colors.cyan(String(deployConf.tunnel))}`,
          );
        if (deployConf.healthCheck !== undefined) {
          console.log(
            `  healthCheck : ${colors.cyan(JSON.stringify(deployConf.healthCheck))}`,
          );
        }
        if (deployConf.preDeploy) {
          console.log(
            `  preDeploy   : ${colors.cyan(JSON.stringify(deployConf.preDeploy))}`,
          );
        }
        if (deployConf.crons && deployConf.crons.length > 0) {
          console.log(
            `  crons       : ${colors.bold(String(deployConf.crons.length))} scheduled job(s)`,
          );
          for (const c of deployConf.crons) {
            console.log(
              `    • ${colors.bold(c.name || c.id || "cron")} [${colors.cyan(c.schedule)}]: ${colors.dim(c.command)}`,
            );
          }
        }
        if (deployConf.notify) {
          const channels = [
            deployConf.notify.discord ? "Discord" : null,
            deployConf.notify.slack ? "Slack" : null,
            deployConf.notify.telegram ? "Telegram" : null,
          ]
            .filter(Boolean)
            .join(", ");
          console.log(
            `  notify      : ${colors.bold(channels || "configured")}`,
          );
        }
      } else {
        console.log(
          `\n${colors.dim(`Project config file: (no ${PROJECT_CONFIG_FILENAME} found in current directory)`)}`,
        );
      }
      console.log();
      break;
    }

    case "get": {
      const key = positionals[1];
      if (!key) {
        throw new Error("Usage: explita config get <key>");
      }
      const globalConfig = loadConfig() || {};
      const projectConf = loadProjectConfig()?.config.deploy || {};

      let val: unknown = (globalConfig as any)[key];
      if (val === undefined) {
        val = (projectConf as any)[key];
      }

      if (val === undefined) {
        console.log(
          `Key "${key}" is not set in global or local project config.`,
        );
      } else {
        console.log(
          typeof val === "object" ? JSON.stringify(val, null, 2) : String(val),
        );
      }
      break;
    }

    case "set": {
      const key = positionals[1];
      const value = positionals[2];
      if (!key || value === undefined) {
        throw new Error("Usage: explita config set <key> <value>");
      }

      if (key === "server" || key === "token") {
        saveConfig({ [key]: value });
        console.log(
          `${colors.green("✔")} Saved ${colors.bold(key)} to ${getConfigPath()}`,
        );
      } else {
        // Save to local project config
        const numVal = Number(value);
        let parsedVal: any = !isNaN(numVal) && key === "port" ? numVal : value;
        let targetKey = key;
        if (key === "domain" || key === "domains") {
          targetKey = "domains";
          parsedVal = normalizeDomains(value);
        }
        const res = saveProjectConfig({ deploy: { [targetKey]: parsedVal } });
        console.log(
          `${colors.green("✔")} Saved ${colors.bold(targetKey)} to ${res.path}`,
        );
      }
      break;
    }

    case "path": {
      console.log(`Global  : ${getConfigPath()}`);
      const projectPath = getProjectConfigPath();
      console.log(`Project : ${projectPath || "(none)"}`);
      break;
    }

    case "--help":
    case "-h": {
      printDeployConfigHelp();
      break;
    }

    default:
      printDeployConfigHelp();
      throw new Error(`Unknown config command: ${subCommand}`);
  }
}
