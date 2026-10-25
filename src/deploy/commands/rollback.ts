import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { api } from "../lib/api.js";
import { printCmdAndDec } from "../../lib/utils.js";
import { parseAppCommand } from "../lib/resolve-app.js";

function printRollbackHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Rollback / Discard`,
    desc: "Roll back production traffic or discard a preview deployment",
    commands: [
      [
        "eda rollback <deploymentId> [--purge]",
        "Roll back production to deployment or discard preview container",
      ],
    ],
    examples: [
      ["eda rollback d-12345", "Roll back production to deployment d-12345"],
      [
        "eda rollback d-12345 --purge",
        "Discard preview deployment and permanently purge record",
      ],
    ],
    options: [
      [
        "-p, --purge",
        "Permanently purge preview deployment record from history",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runRollbackCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseAppCommand(
    args,
    "rollback",
    {
      purge: { type: "boolean", short: "p" },
    },
    { optional: true },
  );

  if (values.help) {
    printRollbackHelp();
    return;
  }

  const deploymentId = positionals[0]?.trim();

  if (!deploymentId) {
    printRollbackHelp();
    throw new Error(
      "Deployment ID is required: explita deploy rollback <deploymentId>",
    );
  }

  const query = values.purge ? "?purge=true" : "";
  const result = await api<{
    ok?: boolean;
    deploymentId?: string;
    appId?: string;
    tunnelUrl?: string | null;
    isPreview?: boolean;
    purged?: boolean;
  }>(`/api/deployments/${encodeURIComponent(deploymentId)}/rollback${query}`, {
    method: "POST",
  });

  if (!result || result.ok === false) {
    throw new Error(`Failed to rollback to deployment ${deploymentId}.`);
  }

  if (result.isPreview) {
    if (result.purged || values.purge) {
      console.log(
        `${colors.green("✔")} Preview deployment ${colors.bold(deploymentId)} discarded and permanently purged from history.\n`,
      );
    } else {
      console.log(
        `${colors.green("✔")} Preview deployment ${colors.bold(deploymentId)} discarded cleanly. Zero production disruption.\n`,
      );
    }
  } else {
    console.log(
      `${colors.green("✔")} Successfully rolled back to deployment ${colors.bold(deploymentId)}.`,
    );
    if (result.tunnelUrl) {
      console.log(
        `  ${colors.bold("Tunnel URL :")} ${colors.cyan(result.tunnelUrl)}`,
      );
    }
    if (result.appId) {
      console.log(
        `  ${colors.bold("App ID     :")} ${colors.cyan(result.appId)}`,
      );
    }
    console.log("");
  }
}
