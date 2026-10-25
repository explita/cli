import { api } from "../lib/api.js";
import { tryResolveAppId } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import type { Deployment } from "../types.js";

function printCancelHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Cancel Deployment`,
    desc: "Abort an in-progress deployment and clean up resources",
    commands: [
      [
        "eda cancel <deploymentId>",
        "Abort an active or queued deployment and clean up resources",
      ],
    ],
    examples: [
      ["eda cancel d-12345", "Cancel specific deployment by ID"],
      [
        "eda cancel",
        "Cancel currently running deployment in current project directory",
      ],
    ],
    options: [["-h, --help", "Show help"]],
  });
}

async function cancelDeploymentById(deploymentId: string): Promise<void> {
  console.log(
    `\n${colors.dim("Cancelling deployment")} ${colors.bold(deploymentId)}...`,
  );

  await api(`/api/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
    method: "POST",
  });

  console.log(
    `${colors.green("✔")} Deployment ${colors.bold(deploymentId)} cancelled successfully. Build stopped and resources cleaned up.\n`,
  );
}

export async function runCancelCommand(args: string[]): Promise<void> {
  const deploymentId = args[0]?.trim();

  if (!deploymentId || deploymentId === "-h" || deploymentId === "--help") {
    if (deploymentId === "-h" || deploymentId === "--help") {
      printCancelHelp();
      return;
    }

    // Try auto-detecting from local explita.json if in project directory
    const localAppId = tryResolveAppId();
    if (localAppId) {
      const deployments = await api<Deployment[]>(
        `/api/apps/${encodeURIComponent(localAppId)}/deployments?status=QUEUED,BUILDING,STARTING,HEALTH_CHECK&take=5&includeLogs=false`,
      ).catch(() => []);

      const activeDep = deployments[0];

      if (activeDep) {
        return cancelDeploymentById(activeDep.id);
      }

      console.log(
        `\n${colors.yellow("ℹ")} No in-progress deployment found to cancel for application "${colors.bold(localAppId)}".\n`,
      );
      return;
    }

    printCancelHelp();
    throw new Error("Deployment ID is required: eda cancel <deploymentId>");
  }

  return cancelDeploymentById(deploymentId);
}
