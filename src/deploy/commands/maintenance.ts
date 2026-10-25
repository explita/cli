import { parseAppCommand } from "../lib/resolve-app.js";
import { api } from "../lib/api.js";
import type { AppMaintenanceResponse } from "@explita/infra-protocol/deploy";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printMaintenanceHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Maintenance`,
    desc: "Instant 503 maintenance mode",
    commands: [
      [
        "eda maintenance on [-a <appId>]",
        "Enable instant 503 maintenance mode",
      ],
      [
        "eda maintenance off [-a <appId>]",
        "Disable maintenance mode and restore traffic",
      ],
      [
        "eda maintenance [status] [-a <appId>]",
        "View current maintenance status",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Application ID (or auto-resolved from explita.json)",
      ],
      ["-h, --help", "Show this help message"],
    ],
    footerNote: `Notes:
  • Live users receive an immediate, responsive 503 Maintenance page across all custom domains and tunnels.
  • Drop a 503.html (or <appId>.503.html) into custom/files on the server to serve your custom page directly from disk.
  • If no custom file is found on disk, Explita's responsive built-in 503 template is served as fallback.
  • Your app container and database remain untouched and fully accessible via eda exec and eda sh.`,
  });
}

export async function runMaintenanceCommand(args: string[]): Promise<void> {
  const { appId, positionals, values } = parseAppCommand(args, "maintenance");

  if (values.help) {
    printMaintenanceHelp();
    return;
  }

  const subCommand = (positionals[0] || "status").toLowerCase();

  switch (subCommand) {
    case "on": {
      const res = await api<AppMaintenanceResponse>(
        `/api/apps/${encodeURIComponent(appId)}/maintenance`,
        {
          method: "POST",
          body: JSON.stringify({ enabled: true }),
        },
      );

      console.log(
        `\n${colors.green("✔")} Maintenance mode ${colors.yellow(colors.bold("ENABLED"))} for application ${colors.bold(appId)}.`,
      );
      if (res.customPage) {
        console.log(
          `  Template: ${colors.green("Custom HTML template active (503.html)")}`,
        );
      } else {
        console.log(`  Template: ${colors.dim("Default Explita template")}`);
      }
      console.log(`
  ${colors.dim("• Live traffic is now serving a responsive 503 Service Unavailable page.")}
  ${colors.dim("• Domain and tunnel requests are safely paused with auto-retry headers.")}
  ${colors.dim("• Your app container and database remain accessible to you:")}
      ${colors.cyan("eda exec")} -a ${appId} -- <cmd>
      ${colors.cyan("eda sh")} -a ${appId}
      ${colors.cyan("eda maintenance off")} -a ${appId}
`);
      break;
    }

    case "off": {
      await api<AppMaintenanceResponse>(
        `/api/apps/${encodeURIComponent(appId)}/maintenance`,
        {
          method: "POST",
          body: JSON.stringify({ enabled: false }),
        },
      );

      console.log(
        `\n${colors.green("✔")} Maintenance mode ${colors.green(colors.bold("DISABLED"))} for application ${colors.bold(appId)}.`,
      );
      console.log(
        `  ${colors.dim("Normal reverse-proxy routing restored to live container across all domains & tunnels.")}\n`,
      );
      break;
    }

    case "status": {
      const res = await api<AppMaintenanceResponse>(
        `/api/apps/${encodeURIComponent(appId)}/maintenance`,
      );
      console.log(formatMaintenanceStatus(res, appId));
      break;
    }

    default:
      console.error(
        `${colors.red("✖")} Unknown maintenance action: "${subCommand}". Expected "on", "off", or "status".`,
      );
      printMaintenanceHelp();
      process.exitCode = 1;
  }
}

export function formatMaintenanceStatus(
  res: AppMaintenanceResponse,
  appId: string,
): string {
  const lines: string[] = [];
  lines.push(`\n${colors.bold("Maintenance Status")}: ${colors.cyan(appId)}`);
  if (res.enabled) {
    lines.push(`  State:      ${colors.yellow(colors.bold("🚧 ON (Active)"))}`);
    if (res.message) {
      lines.push(`  Message:    "${res.message}"`);
    }
    if (res.customPage) {
      lines.push(
        `  Template:   ${colors.green("Custom HTML template active")}`,
      );
    } else {
      lines.push(`  Template:   ${colors.dim("Default Explita template")}`);
    }
    if (res.enabledAt) {
      lines.push(`  Enabled At: ${new Date(res.enabledAt).toLocaleString()}`);
    }
    lines.push(
      `\n  ${colors.dim("Disable with:")} ${colors.cyan(`eda maintenance off -a ${appId}`)}\n`,
    );
  } else {
    lines.push(`  State:      ${colors.green("● OFF (Normal Traffic)")}`);
    if (res.customPage) {
      lines.push(
        `  Template:   ${colors.cyan("Custom HTML available on disk")}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
