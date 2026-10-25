import type { Deployment } from "../types.js";
import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";

export async function runDeploymentsCommand(args: string[]): Promise<void> {
  const { appId, values } = parseAppCommand(args, "history", {
    limit: { type: "string", short: "l" },
    take: { type: "string", short: "n" },
  });

  const take = values.take || values.limit || "25";

  const deployments = await api<Deployment[]>(
    `/api/apps/${encodeURIComponent(appId)}/deployments?take=${encodeURIComponent(String(take))}&includeLogs=false`,
  );

  console.table(
    deployments.map((d) => ({
      id: d.id,
      tag: d.tag ?? "-",
      status: d.status,
      image: d.image ?? "-",
      startedAt: d.startedAt,
      finishedAt: d.finishedAt ?? "-",
    })),
  );
}
