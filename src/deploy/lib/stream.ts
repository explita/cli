import {
  type Deployment,
  isTerminalStatus,
} from "@explita/infra-protocol/deploy";
import { api, wsUrl, wsOptions } from "./api.js";
import { colors } from "@explita/infra-protocol";

export interface StreamDeploymentOptions {
  stopOnPreview?: boolean;
}

export async function streamDeployment(
  deploymentId: string,
  options?: StreamDeploymentOptions,
): Promise<Deployment | void> {
  return new Promise<Deployment | void>((resolvePromise, rejectPromise) => {
    let cancelling = false;
    const onSigint = async () => {
      if (cancelling) return;
      cancelling = true;
      process.removeListener("SIGINT", onSigint);
      process.stdout.write(
        `\n\n${colors.yellow("⚠")} Aborting deployment (${deploymentId})...\n`,
      );
      try {
        await api(
          `/api/deployments/${encodeURIComponent(deploymentId)}/cancel`,
          {
            method: "POST",
          },
        );
        process.stdout.write(
          `${colors.green("✔")} Deployment ${deploymentId} cancelled on server.\n\n`,
        );
      } catch (err: any) {
        process.stdout.write(
          `${colors.red("✖")} Failed to cancel on server: ${err?.message || err}\n\n`,
        );
      }
      process.exit(130);
    };

    process.on("SIGINT", onSigint);

    let resolved = false;
    const finish = (error?: Error, result?: Deployment) => {
      if (resolved) return;
      resolved = true;
      process.removeListener("SIGINT", onSigint);
      if (error) rejectPromise(error);
      else resolvePromise(result);
    };

    let printedStatus = "";
    const printStatus = (status: string) => {
      if (status !== printedStatus) {
        printedStatus = status;
        const color =
          status === "LIVE"
            ? colors.green
            : status === "PREVIEW"
              ? colors.cyan
              : status === "FAILED" || status === "ROLLED_BACK"
                ? colors.red
                : status === "CANCELLED"
                  ? colors.yellow
                  : status === "BUILDING"
                    ? colors.cyan
                    : colors.yellow;
        process.stdout.write(`\n--> Status: ${color(colors.bold(status))}\n`);
      }
    };

    let printedLogsCount = 0;
    const printLogs = (logs: string[]) => {
      for (let i = printedLogsCount; i < logs.length; i++) {
        process.stdout.write(`${logs[i]}\n`);
      }
      printedLogsCount = logs.length;
    };

    const WS = (globalThis as any).WebSocket;
    if (typeof WS === "function") {
      try {
        const socket = new WS(
          wsUrl(`/api/deployments/${deploymentId}/stream`),
          wsOptions(),
        );

        socket.onmessage = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "update" || data.type === "snapshot") {
              const dep: Deployment = data.deployment;
              printStatus(dep.status);
              if (dep.logs) printLogs(dep.logs);

              if (dep.status === "PREVIEW" && options?.stopOnPreview) {
                socket.close();
                finish(undefined, dep);
                return;
              }

              if (isTerminalStatus(dep.status)) {
                socket.close();
                if (dep.status === "LIVE") {
                  console.log(
                    `\n${colors.green("✔")} ${colors.bold(`Deployment ${dep.id} is live!`)}`,
                  );
                  if (dep.appId) {
                    console.log(`  App ID:  ${colors.cyan(dep.appId)}\n`);
                  }
                  finish(undefined, dep);
                } else if (dep.status === "CANCELLED") {
                  console.log(
                    `\n${colors.yellow("⚠")} Deployment ${colors.bold(dep.id)} was cancelled.\n`,
                  );
                  finish(undefined, dep);
                } else {
                  finish(
                    new Error(
                      `Deployment ${dep.id} finished with status: ${dep.status}${dep.error ? `\nError: ${dep.error}` : ""}`,
                    ),
                  );
                }
              }
            }
          } catch {
            // ignore JSON parse errors
          }
        };

        socket.onerror = () => {
          startPollingFallback();
        };

        socket.onclose = () => {
          if (!resolved) {
            setTimeout(startPollingFallback, 500);
          }
        };

        return;
      } catch {
        // Fall back to polling
      }
    }

    startPollingFallback();

    function startPollingFallback() {
      const timer = setInterval(async () => {
        try {
          const dep = await api<Deployment>(`/api/deployments/${deploymentId}`);
          printStatus(dep.status);
          if (dep.logs) printLogs(dep.logs);

          if (dep.status === "PREVIEW" && options?.stopOnPreview) {
            clearInterval(timer);
            finish(undefined, dep);
            return;
          }

          if (isTerminalStatus(dep.status)) {
            clearInterval(timer);
            if (dep.status === "LIVE") {
              console.log(
                `\n${colors.green("✔")} ${colors.bold(`Deployment ${dep.id} is live!`)}`,
              );
              if (dep.appId) {
                console.log(`  App ID:  ${colors.cyan(dep.appId)}\n`);
              }
              finish(undefined, dep);
            } else if (dep.status === "CANCELLED") {
              console.log(
                `\n${colors.yellow("⚠")} Deployment ${colors.bold(dep.id)} was cancelled.\n`,
              );
              finish(undefined, dep);
            } else {
              finish(
                new Error(
                  `Deployment ${dep.id} finished with status: ${dep.status}${dep.error ? `\nError: ${dep.error}` : ""}`,
                ),
              );
            }
          }
        } catch (error) {
          clearInterval(timer);
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }, 1000);
    }
  });
}
