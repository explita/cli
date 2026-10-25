import type { App } from "../types.js";
import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { colors } from "@explita/infra-protocol";

export async function runTunnelCommand(args: string[]): Promise<void> {
  const { appId, positionals, values } = parseAppCommand(args, "tunnel", {
    subdomain: { type: "string", short: "s" },
  });

  const action = positionals[0]?.toLowerCase();
  if (action !== "enable" && action !== "disable") {
    throw new Error(
      "Usage: explita deploy tunnel <enable|disable> [-a <appId>] [-s <subdomain>]",
    );
  }

  const isEnable = action === "enable";
  const patchBody: Record<string, any> = { tunnel: isEnable };
  if (values.subdomain !== undefined) {
    patchBody.subdomain = values.subdomain;
  }

  const result = await api<App & { tunnelUrl?: string }>(
    `/api/apps/${encodeURIComponent(appId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patchBody),
    },
  );
  const stateText = isEnable
    ? colors.green("enabled")
    : colors.yellow("disabled");
  console.log(
    `${colors.green("✔")} Tunnel ${stateText} for application ${colors.bold(appId)}.`,
  );

  if (isEnable) {
    const tunnelUrl = result?.metadata?.tunnel?.url;
    if (tunnelUrl) {
      console.log(`\n  Tunnel URL: ${colors.cyan(colors.bold(tunnelUrl))}\n`);
    } else {
      console.log(
        `\n  ${colors.dim("(Tunnel will activate automatically once a deployment is live)")}\n`,
      );
    }
  }
}
