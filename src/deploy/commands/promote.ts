import { api, handleFetchError, baseUrl } from "../lib/api.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import type { Deployment } from "../types.js";

function printPromoteHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Promote`,
    desc: "Promote a preview deployment to production",
    commands: [
      [
        "eda promote <deploymentId>",
        "Promote isolated preview deployment to production with zero downtime",
      ],
    ],
    examples: [
      ["eda promote d-12345", "Promote deployment d-12345 to live production"],
    ],
    options: [["-h, --help", "Show help"]],
  });
}

export async function runPromoteCommand(args: string[]): Promise<void> {
  const deploymentId = args[0]?.trim();

  if (!deploymentId || deploymentId === "-h" || deploymentId === "--help") {
    if (deploymentId === "-h" || deploymentId === "--help") {
      printPromoteHelp();
      return;
    }
    throw new Error(
      "Deployment ID is required: explita deploy promote <deploymentId>",
    );
  }

  try {
    console.log(
      `\n${colors.dim("Promoting preview deployment")} ${colors.bold(deploymentId)} ${colors.dim("to production (zero-downtime)...")}`,
    );

    const promoted = await api<Deployment>(
      `/api/deployments/${encodeURIComponent(deploymentId)}/promote`,
      { method: "POST" },
    );

    console.log(
      `\n${colors.green("✔")} ${colors.bold(`Deployment ${promoted.id || deploymentId} promoted to production!`)}`,
    );
    if (promoted.appId) {
      console.log(`  App ID:  ${colors.cyan(promoted.appId)}`);
    }
    console.log();

    const tunnelUrl = promoted.tunnelUrl;
    const domains = promoted.domains || [];

    if (tunnelUrl || domains.length > 0) {
      console.log(colors.bold("Production Access URLs:"));
      if (tunnelUrl) {
        console.log(`  Tunnel:  ${colors.cyan(colors.bold(tunnelUrl))}`);
      }
      for (const dom of domains) {
        console.log(`  Custom:  ${colors.cyan(colors.bold(dom))}`);
      }
      console.log();
    }
  } catch (err) {
    throw handleFetchError(err, baseUrl());
  }
}
