import { STATUS_CODES } from "node:http";
import { CLI_VERSION } from "./constants.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";

export interface TunnelStatusInfo {
  url: string;
  port: number;
  target?: string;
  hostHeader?: string;
  encrypted?: boolean;
  fingerprint?: string;
  tokenActive?: boolean;
  authEnabled?: boolean;
  ipFilterActive?: boolean;
  allowedIpsCount?: number;
  inspectorUrl?: string;
  inspectActive?: boolean;
  message?: string;
}

export function printTunnelStatus(
  status: "connected" | "reconnected",
  info: TunnelStatusInfo,
): void {
  const versionTag = colors.dim(`v${CLI_VERSION}`);
  const statusNote =
    status === "reconnected" ? ` ${colors.yellow("(reconnected)")}` : "";

  console.log(
    `\n${colors.cyan(colors.bold(PRODUCT_NAME.tunnel))} ${versionTag}${statusNote}`,
  );
  console.log(colors.dim("——————————————————————————————————————————————"));

  if (info.tokenActive) {
    console.log(
      `${colors.green("✓")} ${colors.bold("Authenticated")} ${colors.dim("•")} ${colors.dim("Token active")}`,
    );
  } else {
    console.log(
      `${colors.dim("•")} ${colors.dim("Anonymous session")} ${colors.dim("•")} ${colors.dim("No token")}`,
    );
  }

  if (info.authEnabled) {
    console.log(
      `${colors.green("✓")} ${colors.bold("Basic Auth active")} ${colors.dim("•")} ${colors.yellow("HTTP 401 Protected")}`,
    );
  }

  if (info.ipFilterActive) {
    const rulesText = info.allowedIpsCount
      ? ` (${info.allowedIpsCount} rule${info.allowedIpsCount === 1 ? "" : "s"})`
      : "";
    console.log(
      `${colors.green("✓")} ${colors.bold("IP Allowlist active")}${rulesText} ${colors.dim("•")} ${colors.yellow("HTTP 403 Restricted")}`,
    );
  }

  if (info.hostHeader) {
    const defaultTargetLabel = info.target
      ? info.target.replace(/^https?:\/\//, "")
      : `localhost:${info.port}`;
    const rewriteLabel =
      info.hostHeader === "rewrite"
        ? `rewrite (${colors.dim(`-> ${defaultTargetLabel}`)})`
        : info.hostHeader;
    console.log(
      `${colors.green("✓")} ${colors.bold("Host Header:")} ${colors.cyan(rewriteLabel)}`,
    );
  }

  if (info.encrypted !== false) {
    console.log(
      `${colors.green("✓")} ${colors.bold("Key exchange complete")} ${colors.dim("•")} ${colors.magenta("ECDH P-256 + AES-GCM (256-bit)")}`,
    );
  } else {
    console.log(
      `${colors.yellow("!")} ${colors.bold("Encryption disabled")} ${colors.dim("•")} ${colors.yellow("Plaintext")}`,
    );
  }

  console.log(
    `${colors.bold("Public URL:")} ${colors.cyan(colors.bold(info.url))}`,
  );
  const forwardingTarget = info.target || `http://localhost:${info.port}`;
  console.log(`${colors.bold("Forwarding:")} ${forwardingTarget}`);

  if (info.inspectorUrl) {
    console.log(
      `${colors.bold("Inspector:")}  ${colors.cyan(colors.bold(info.inspectorUrl))}`,
    );
  }

  if (info.fingerprint) {
    console.log(
      `${colors.dim("Fingerprint:")} ${colors.dim(info.fingerprint)}`,
    );
  }

  if (info.message) {
    console.log(`\n${colors.cyan("ℹ")} ${colors.bold(info.message)}`);
  }

  if (info.inspectActive !== false) {
    console.log(
      `\n${colors.dim("Shortcuts: [r] Replay • [w] Wire log • [c] Clear screen • [h] Help")}`,
    );
    console.log(`${colors.dim("Incoming Traffic Stream:")}`);
  } else {
    console.log(`\n${colors.dim("Shortcuts: [c] Clear screen • [h] Help")}`);
  }
}

export function logWire(direction: "in" | "out", raw: string): void {
  const isEncrypted = raw.includes('"type":"encrypted"');
  const badge = isEncrypted
    ? colors.green("🔒 CIPHERTEXT")
    : colors.yellow("🔓 PLAINTEXT ");
  const arrow =
    direction === "out" ? colors.cyan("[WIRE ->]") : colors.dim("[WIRE <-]");
  const preview = raw.length > 90 ? `${raw.slice(0, 90)}...` : raw;
  console.log(`${arrow} ${badge} ${colors.dim(preview)}`);
}

export function printDisconnect(reconnecting: boolean): void {
  if (reconnecting) {
    console.log(
      `\n${colors.yellow("Tunnel disconnected.")} ${colors.dim("Reconnecting...")}`,
    );
  } else {
    console.log(`\n${colors.yellow("Tunnel disconnected.")}\n`);
  }
}

export function printError(title: string, error: unknown): void {
  console.error(`\n${colors.red(colors.bold(title + ":"))}`);
  console.error(`${error instanceof Error ? error.message : String(error)}\n`);
}

function getStatusColor(status: number): (text: string) => string {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.dim;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function logRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  detail?: string,
): void {
  const statusColor = getStatusColor(status);
  const statusText = STATUS_CODES[status] || "";
  const statusFormatted = statusColor(
    colors.bold(`${status} ${statusText}`.trim()),
  );
  const methodFormatted = colors.dim(method.toUpperCase());
  const duration = colors.dim(formatDuration(durationMs));
  const detailFormatted = detail ? ` ${colors.red(`(${detail})`)}` : "";

  console.log(
    `${statusFormatted} ${methodFormatted} ${path} ${duration}${detailFormatted}`,
  );
}

export function logWs(
  path: string,
  event: "open" | "close",
  encrypted = true,
): void {
  if (event === "open") {
    const statusTag = colors.magenta(colors.bold("101 SW"));
    const proto = colors.dim(encrypted ? "WSS" : "WS");
    const tag = encrypted
      ? colors.magenta("[Encrypted Frame]")
      : colors.green("[Connected]");

    console.log(`${statusTag} ${proto} ${path} ${tag}`);
  } else {
    const statusTag = colors.dim("--- --");
    const proto = colors.dim("WS");
    console.log(`${statusTag} ${proto} ${path} ${colors.dim("[Closed]")}`);
  }
}

export function logReplay(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  detail?: string,
): void {
  const statusColor =
    status >= 500
      ? colors.red
      : status >= 400
        ? colors.yellow
        : status >= 300
          ? colors.cyan
          : colors.green;

  const statusText = STATUS_CODES[status] || "Unknown";
  const statusFormatted = statusColor(
    colors.bold(`${status} ${statusText}`.trim()),
  );
  const tag = colors.magenta(colors.bold("⚡ [REPLAY]"));
  const methodFormatted = colors.dim(method.toUpperCase());
  const duration = colors.dim(formatDuration(durationMs));
  const detailFormatted = detail ? ` ${colors.red(`(${detail})`)}` : "";

  console.log(
    `${tag} ${statusFormatted} ${methodFormatted} ${path} ${duration}${detailFormatted}`,
  );
}
