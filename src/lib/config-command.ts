import { parseArgs } from "node:util";
import {
  getGlobalConfigPath,
  loadGlobalConfig,
  saveGlobalConfig,
  colors,
} from "@explita/infra-protocol";
import { printCmdAndDec } from "./utils.js";

function printConfigHelp(): void {
  printCmdAndDec({
    product: "Explita Global Config",
    desc: `Manage configuration (${getGlobalConfigPath()})`,
    commands: [
      ["explita config", "List unified configuration"],
      ["explita config ls", "List unified configuration"],
      [
        "explita config get <key>",
        "Get value (e.g. deploy.server, tunnel.token)",
      ],
      [
        "explita config set <key> <value>",
        "Set value (e.g. deploy.server, tunnel.token)",
      ],
      ["explita config path", "Show global config file path"],
    ],
    options: [["-h, --help", "Show help"]],
    footerNote: `Subsystem namespaces:
  • deploy.server, deploy.token
  • tunnel.token, tunnel.server, tunnel.email`,
  });
}

export async function runGlobalConfigCommand(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    printConfigHelp();
    return;
  }

  const subCommand = positionals[0]?.toLowerCase();

  switch (subCommand) {
    case undefined:
    case "ls": {
      const config = loadGlobalConfig();
      console.log(
        `\n${colors.bold("Global config:")} ${colors.dim(getGlobalConfigPath())}\n`,
      );
      console.log(colors.cyan(colors.bold("[deploy]")));
      console.log(`  server : ${config.deploy?.server || "(not configured)"}`);
      console.log(
        `  token  : ${config.deploy?.token ? `${config.deploy.token.slice(0, 4)}...${config.deploy.token.slice(-4)}` : "(not configured)"}`,
      );
      console.log(`\n${colors.cyan(colors.bold("[tunnel]"))}`);
      console.log(
        `  server : ${config.tunnel?.server || "(default: https://tunnel.explita.ng)"}`,
      );
      console.log(
        `  token  : ${config.tunnel?.token ? `${config.tunnel.token.slice(0, 4)}...${config.tunnel.token.slice(-4)}` : "(not configured)"}`,
      );
      if (config.tunnel?.email) {
        console.log(`  email  : ${config.tunnel.email}`);
      }
      if (config.updatedAt) {
        console.log(`\n${colors.dim(`updated: ${config.updatedAt}`)}`);
      }
      console.log();
      break;
    }

    case "get": {
      const key = positionals[1];
      if (!key) {
        throw new Error(
          "Usage: explita config get <key> (e.g. deploy.server, tunnel.token)",
        );
      }
      const config = loadGlobalConfig() as Record<string, any>;
      const parts = key.split(".");
      let val: any = config;
      for (const p of parts) {
        val = val?.[p];
      }
      if (val === undefined) {
        console.log(`Key "${key}" is not set.`);
      } else {
        console.log(
          typeof val === "object" ? JSON.stringify(val, null, 2) : val,
        );
      }
      break;
    }

    case "set": {
      const key = positionals[1];
      const val = positionals[2];
      if (!key || val === undefined) {
        throw new Error("Usage: explita config set <key> <value>");
      }
      const config = loadGlobalConfig() as Record<string, any>;
      const parts = key.split(".");
      if (parts.length === 1) {
        if (key === "server" || key === "token") {
          throw new Error(
            `Ambiguous key "${key}". Use deploy.${key} or tunnel.${key}.`,
          );
        }
        config[key] = val;
      } else {
        const [section, subkey] = parts;
        config[section] = config[section] || {};
        config[section][subkey] = val;
      }
      saveGlobalConfig(config);
      console.log(
        `${colors.green("✔")} Saved ${colors.bold(key)} to ${getGlobalConfigPath()}`,
      );
      break;
    }

    case "path": {
      console.log(getGlobalConfigPath());
      break;
    }

    default:
      printConfigHelp();
      throw new Error(`Unknown config command: ${subCommand}`);
  }
}
