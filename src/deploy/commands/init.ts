import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import {
  saveProjectConfig,
  loadProjectConfig,
  getProjectConfigPath,
  normalizeDomains,
  DEFAULT_SCHEMA_URL,
  PRODUCT_NAME,
  DEFAULT_CONTAINER_PORT,
  colors,
} from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import { detectProjectName, detectProjectPort } from "../lib/detect.js";

function printDeployInitHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Init`,
    desc: "Initialize project configuration with $schema auto-completion",
    commands: [
      ["eda init [options]", "Initialize project deploy configuration"],
      ["explita init [options]", "Full command alias"],
    ],
    examples: [
      ["eda init", "Initialize with auto-detected defaults"],
      ["eda init -n my-api -p 8080", "Specify app name and port"],
      [
        "eda init -n frontend -p 3000 -d app.example.com -d api.example.com",
        "Specify custom domains",
      ],
      ["eda init --force -p 4000", "Overwrite existing configuration"],
    ],
    options: [
      [
        "-n, --name <name>",
        "Application name (default: auto-detected from package.json or folder)",
      ],
      ["-p, --port <port>", "Application port (default: 3000)"],
      [
        "-d, --domain <domain>",
        "Custom domain(s) (can be specified multiple times or comma-separated)",
      ],
      [
        "-f, --force",
        "Overwrite existing deploy configuration if already present",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

function detectProjectDefaults(cwd: string): { name: string; port: number } {
  return {
    name: detectProjectName(cwd),
    port: detectProjectPort(cwd) || DEFAULT_CONTAINER_PORT,
  };
}

export async function runDeployInitCommand(
  args: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: "string", short: "n" },
      port: { type: "string", short: "p" },
      domain: { type: "string", multiple: true, short: "d" },
      force: { type: "boolean", short: "f" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printDeployInitHelp();
    return;
  }

  const existingConfig = loadProjectConfig(cwd)?.config;
  const existingPath = getProjectConfigPath(cwd);

  if (existingConfig?.deploy && !values.force) {
    console.log(
      `\n${colors.yellow("⚠")} ${colors.bold("Explita Deploy is already initialized in")} ${colors.cyan(existingPath || "explita.json")}`,
    );
    if (existingConfig.deploy.name) {
      console.log(`  Name:   ${colors.bold(existingConfig.deploy.name)}`);
    }
    if (existingConfig.deploy.port) {
      console.log(
        `  Port:   ${colors.cyan(String(existingConfig.deploy.port))}`,
      );
    }
    const currentDomains = normalizeDomains(existingConfig.deploy.domains);
    if (currentDomains.length > 0) {
      console.log(`  Domain: ${colors.cyan(currentDomains.join(", "))}`);
    }
    console.log(
      `\n${colors.dim("💡 Use")} ${colors.bold("eda config set <key> <val>")} ${colors.dim("to update settings, or re-run with")} ${colors.bold("--force / -f")} ${colors.dim("to reinitialize.")}\n`,
    );
    return;
  }

  const defaults = detectProjectDefaults(cwd);
  const name = values.name?.trim() || defaults.name;
  const rawPort = values.port ? parseInt(values.port, 10) : defaults.port;
  const port = isNaN(rawPort) ? DEFAULT_CONTAINER_PORT : rawPort;
  const domains = values.domain ? normalizeDomains(values.domain) : [];

  const res = saveProjectConfig(
    {
      deploy: {
        name,
        port,
        ...(domains.length > 0 ? { domains } : {}),
      },
    },
    cwd,
    { replaceDeploy: Boolean(values.force) },
  );

  console.log(
    `\n${colors.green("✔")} ${colors.bold(existingPath ? "Updated" : "Created")} ${colors.cyan(res.path)}`,
  );
  console.log(`  ${colors.dim("Name:")}    ${colors.bold(name)}`);
  console.log(`  ${colors.dim("Port:")}    ${colors.cyan(String(port))}`);
  if (domains.length > 0) {
    console.log(
      `  ${colors.dim("Domains:")} ${colors.cyan(domains.join(", "))}`,
    );
  }

  console.log(
    `  ${colors.dim("Schema:")}  ${colors.dim(res.config.$schema || DEFAULT_SCHEMA_URL)}`,
  );
  console.log(
    `\n${colors.dim("💡 Instant auto-completion, validation, and hover docs are enabled in VS Code/IDEs without installing any local packages!")}`,
  );

  console.log(
    `\n${colors.dim("Deploy anytime with:")} ${colors.bold(colors.cyan("eda"))}\n`,
  );
}
