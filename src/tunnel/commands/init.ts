import { parseArgs } from "node:util";
import {
  isValidIpOrCidr,
  parseAllowedIps,
  PROJECT_CONFIG_FILENAME,
  saveTunnelProjectConfig,
  getProjectConfigPath,
  loadProjectConfig,
  colors,
  PRODUCT_NAME,
} from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printTunnelInitHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.tunnel} Init`,
    desc: `Initialize a local project tunnel configuration (${PROJECT_CONFIG_FILENAME})`,
    usage: "eta init [port] [options]",
    commands: [
      ["eta init [port] [options]", "Initialize project tunnel configuration"],
      ["explita tunnel init [port] [options]", "Full command alias"],
    ],
    examples: [
      ["eta init 3000", "Initialize tunnel configuration for port 3000"],
      ["eta init 5173 -s my-frontend", "Specify preferred subdomain"],
      [
        'eta init 8080 -s api-server -a "dev:secret" -i "1.2.3.4"',
        "Configure authentication and IP restrictions",
      ],
      ["eta init 3000 --force", "Overwrite existing configuration"],
    ],
    options: [
      ["-p, --port <number>", "Local port to expose (e.g. 3000)"],
      ["-s, --subdomain <name>", "Preferred subdomain for this project"],
      ["-a, --auth <user:pass>", "Basic HTTP authentication"],
      [
        "-i, --allow-ip <cidr>",
        'Restrict tunnel access to specific IP or CIDR (e.g. -i "1.2.3.4, 10.0.0.0/8")',
      ],
      [
        "-f, --force",
        "Overwrite existing tunnel configuration if already present",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runInitCommand(
  args: string[],
  cwd: string = process.cwd(),
): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        port: { type: "string", short: "p" },
        subdomain: { type: "string", short: "s" },
        auth: { type: "string", short: "a" },
        "allow-ip": { type: "string", short: "i" },
        force: { type: "boolean", short: "f" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printTunnelInitHelp();
    return;
  }

  const rawPort = values.port || positionals[0];
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      `Invalid port: "${rawPort}". Must be an integer between 1 and 65535.`,
    );
    process.exit(1);
  }

  const subdomain = values.subdomain?.trim().toLowerCase();
  const auth = values.auth;

  if (auth && !auth.includes(":")) {
    console.error(
      `Invalid auth format: "${auth}". Please use "username:password".`,
    );
    process.exit(1);
  }

  const rawAllowIp = values["allow-ip"] as string | undefined;
  let allowIp: string | string[] | undefined;
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
      allowIp = parsed.length === 1 ? parsed[0] : parsed;
    }
  }

  const existingConfig = loadProjectConfig(cwd)?.config;
  const existingPath = getProjectConfigPath(cwd);

  if (existingConfig?.tunnel && !values.force) {
    console.log(
      `\n${colors.yellow("⚠")} ${colors.bold("Explita Tunnel is already initialized in")} ${colors.cyan(existingPath)}`,
    );
    if (existingConfig.tunnel.port) {
      console.log(
        `  Port:      ${colors.bold(String(existingConfig.tunnel.port))}`,
      );
    }
    if (existingConfig.tunnel.subdomain) {
      console.log(
        `  Subdomain: ${colors.cyan(existingConfig.tunnel.subdomain)}`,
      );
    }
    if (existingConfig.tunnel.auth) {
      console.log(`  Auth:      ${colors.yellow("Enabled")}`);
    }
    if (existingConfig.tunnel.allowIp) {
      const count = Array.isArray(existingConfig.tunnel.allowIp)
        ? existingConfig.tunnel.allowIp.length
        : 1;
      console.log(
        `  Allow IP:  ${colors.green(`${count} rule${count === 1 ? "" : "s"}`)}`,
      );
    }
    console.log(
      `\n${colors.dim("💡 Use")} ${colors.bold("eta config set <key> <val>")} ${colors.dim("to update settings, or re-run with")} ${colors.bold("--force / -f")} ${colors.dim("to reinitialize.")}\n`,
    );
    return;
  }

  const res = saveTunnelProjectConfig(
    {
      port,
      ...(subdomain ? { subdomain } : {}),
      ...(auth ? { auth } : {}),
      ...(allowIp ? { allowIp } : {}),
    },
    cwd,
    { replace: Boolean(values.force) },
  );

  console.log(
    `\n${colors.green("✓")} ${colors.bold(existingPath ? "Updated" : "Created")} ${colors.cyan(res.path)}`,
  );
  console.log(`  ${colors.dim("Port:")}      ${colors.bold(String(port))}`);
  if (subdomain) {
    console.log(`  ${colors.dim("Subdomain:")} ${colors.cyan(subdomain)}`);
  }
  if (auth) {
    console.log(`  ${colors.dim("Auth:")}      ${colors.yellow("Enabled")}`);
  }
  if (allowIp) {
    const count = Array.isArray(allowIp) ? allowIp.length : 1;
    console.log(
      `  ${colors.dim("Allow IP:")}  ${colors.green(`${count} rule${count === 1 ? "" : "s"}`)}`,
    );
  }
  console.log(
    `\n${colors.dim("You can now simply run")} ${colors.cyan(colors.bold("eta"))} ${colors.dim("in this directory without passing flags!")}\n`,
  );
}
