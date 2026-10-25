import type { Domain } from "../types.js";
import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import type { DomainCheckResult } from "@explita/infra-protocol/deploy";
import {
  normalizeDomains,
  PRODUCT_NAME,
  colors,
} from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printDomainHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Domain`,
    desc: "Manage custom domains, SSL certificates & routing",
    usage: "explita deploy domain <command> [options]",
    commands: [
      ["ls [-a <appId>]", "List all domains attached to an application"],
      ["add <domain> [-a <appId>]", "Attach a custom domain to an application"],
      [
        "rm <domain> [-a <appId>]",
        "Remove a custom domain from an application",
      ],
      [
        "check <domain> [-a <appId>]",
        "Verify DNS resolution & SSL certificate status (alias: verify)",
      ],
    ],
    examples: [
      ["eda domain ls", "List all attached domains"],
      ["eda domain add api.example.com", "Attach a custom domain"],
      ["eda domain check api.example.com", "Verify DNS and SSL certificates"],
      [
        "eda domain check -a my-app",
        "Check domains for a specific application",
      ],
      ["eda domain rm api.example.com", "Remove a custom domain"],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from explita.json)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export function formatDomainCheck(check: DomainCheckResult): string {
  const lines: string[] = [];
  lines.push(
    `\n${colors.bold("Domain Verification:")} ${colors.cyan(check.domain)}`,
  );
  lines.push(
    `${colors.dim("Target Server IP:")} ${colors.bold(check.serverIp)}`,
  );
  lines.push("");

  // DNS
  lines.push(colors.bold("DNS Resolution:"));
  if (check.dns.status === "verified") {
    lines.push(`  ${colors.green("✔")} ${check.dns.message}`);
    if (check.dns.cnameRecords.length > 0) {
      lines.push(
        `    ${colors.dim(`(via CNAME: ${check.dns.cnameRecords.join(", ")})`)}`,
      );
    }
  } else if (check.dns.status === "mismatch") {
    lines.push(`  ${colors.yellow("⚠️")} ${check.dns.message}`);
    lines.push(
      `    ${colors.dim("Action:")} Update your DNS A/CNAME record with your registrar to point to ${colors.bold(check.serverIp)}.`,
    );
  } else {
    lines.push(`  ${colors.red("✖")} ${check.dns.message}`);
    lines.push(
      `    ${colors.dim("Action:")} Add an A record pointing to ${colors.bold(check.serverIp)} (or CNAME target) in your DNS dashboard.`,
    );
  }

  // SSL
  lines.push("");
  lines.push(colors.bold("SSL / TLS Certificate:"));
  if (check.ssl.hasCertificate) {
    lines.push(`  ${colors.green("✔")} ${check.ssl.message}`);
  } else {
    if (check.dns.status === "verified") {
      lines.push(`  ${colors.cyan("⏳")} ${check.ssl.message}`);
    } else {
      lines.push(
        `  ${colors.dim("⏳")} Pending DNS resolution before we can complete automated ACME challenge.`,
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

export async function runDomainCommand(args: string[]): Promise<void> {
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case "ls": {
      const { appId } = parseAppCommand(args.slice(1), "domain ls");

      const domains = await api<Domain[]>(
        `/api/apps/${encodeURIComponent(appId)}/domains`,
      );

      if (!domains || domains.length === 0) {
        console.log(`No custom domains attached to application "${appId}".`);
        return;
      }

      console.table(
        domains.map((d) => ({
          id: d.id,
          domain: d.hostname,
          createdAt: d.createdAt,
        })),
      );
      break;
    }

    case "add": {
      const { appId, positionals } = parseAppCommand(
        args.slice(1),
        "domain add",
      );

      const domainNames = normalizeDomains(positionals);
      if (domainNames.length === 0) {
        throw new Error(
          "Usage: explita deploy domain add <domain...> [-a <appId>]\nExample: explita deploy domain add api.example.com",
        );
      }

      const result = await api<{
        domains?: Domain[];
        created?: Domain[];
        existing?: Domain[];
        verifications?: Array<{
          domain: string;
          verification: DomainCheckResult;
        }>;
        warnings?: string[];
      }>(`/api/apps/${encodeURIComponent(appId)}/domains`, {
        method: "POST",
        body: JSON.stringify({ domains: domainNames }),
      });

      console.log(
        `\n${colors.green("✔")} Attached ${colors.bold(String(domainNames.length))} domain(s) to ${colors.cyan(appId)}: ${colors.cyan(domainNames.join(", "))}\n`,
      );

      if (result.verifications && result.verifications.length > 0) {
        for (const item of result.verifications) {
          if (item.verification?.dns?.status === "verified") {
            console.log(
              `  ${colors.green("✔")} ${colors.bold(item.domain)}: ${item.verification.dns.message}`,
            );
          } else if (item.verification?.dns?.message) {
            console.log(
              `  ${colors.yellow("⚠️")} ${colors.bold(item.domain)}: ${item.verification.dns.message}`,
            );
          }
        }
        console.log();
      }
      break;
    }

    case "rm": {
      const { appId, positionals } = parseAppCommand(
        args.slice(1),
        "domain rm",
      );

      const domainName = positionals[0];
      if (!domainName) {
        throw new Error(
          "Usage: explita deploy domain rm <domain> [-a <appId>]\nExample: explita deploy domain rm api.example.com",
        );
      }

      await api(
        `/api/apps/${encodeURIComponent(appId)}/domains/${encodeURIComponent(domainName)}`,
        {
          method: "DELETE",
        },
      );

      console.log(
        `${colors.green("✔")} Domain ${colors.bold(domainName)} successfully removed from ${colors.cyan(appId)}.`,
      );
      break;
    }

    case "check":
    case "verify": {
      const { appId, positionals } = parseAppCommand(
        args.slice(1),
        "domain check",
        {},
        { optional: true },
      );

      const domainName = positionals[0]?.trim();

      if (domainName) {
        // Direct domain verification
        const check = await api<DomainCheckResult>(
          `/api/system/domain-check?domain=${encodeURIComponent(domainName)}`,
        );
        console.log(formatDomainCheck(check));
        return;
      }

      if (appId) {
        // Check all domains attached to this app
        const checks = await api<DomainCheckResult[]>(
          `/api/apps/${encodeURIComponent(appId)}/domain-check`,
        );

        if (!checks || checks.length === 0) {
          console.log(
            `No custom domains configured for application "${appId}". Attach one with 'eda domain add <domain>'.`,
          );
          return;
        }

        for (const item of checks) {
          console.log(formatDomainCheck(item));
        }
        return;
      }

      throw new Error(
        "Usage: explita deploy domain check <domain> [-a <appId>]\nExamples:\n  eda domain check api.example.com\n  eda domain check -a my-app",
      );
    }

    default:
      printDomainHelp();
      if (subCommand && subCommand !== "--help" && subCommand !== "-h") {
        throw new Error(`Unknown domain subcommand: ${subCommand}`);
      }
      break;
  }
}
