import {
  colors,
  isNewerVersion,
  loadDeployConfig,
  saveDeployConfig,
  type DeployUpdateCheck,
} from "@explita/infra-protocol";
import { stripAnsi } from "../../lib/utils.js";

export const UPSTREAM_DEPLOY_PACKAGE_URL =
  "https://raw.githubusercontent.com/explita/deploy-server/main/package.json";
export const UPSTREAM_CLI_PACKAGE_URL =
  "https://registry.npmjs.org/@explita/cli/latest";
export const UPSTREAM_SETUP_SCRIPT_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/explita/deploy-server/main/scripts/setup.sh | sudo bash";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NOTIFICATION_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours

export type UpdateCacheData = DeployUpdateCheck;

export function loadUpdateCache(): DeployUpdateCheck {
  const deploy = loadDeployConfig();
  return deploy?.updateCheck || { checkedAt: 0 };
}

export function saveUpdateCache(data: Partial<DeployUpdateCheck>): void {
  const existing = loadUpdateCache();
  const merged: DeployUpdateCheck = {
    ...existing,
    ...data,
  };
  saveDeployConfig({ updateCheck: merged });
}

/**
 * Fetches the latest published deploy server version from upstream GitHub repository.
 */
export async function fetchUpstreamDeployVersion(
  timeoutMs = 2500,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(UPSTREAM_DEPLOY_PACKAGE_URL, {
      signal: controller.signal,
      headers: { "user-agent": "explita-cli-update-check" },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === "string" ? data.version.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Fetches the latest CLI version from npm registry.
 */
export async function fetchUpstreamCliVersion(
  timeoutMs = 2500,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(UPSTREAM_CLI_PACKAGE_URL, {
      signal: controller.signal,
      headers: { "user-agent": "explita-cli-update-check" },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === "string" ? data.version.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Records the deploy server version observed on API response headers.
 */
export function recordObservedServerVersion(version: string): void {
  if (!version) return;
  saveUpdateCache({
    lastObservedServerVersion: version.trim(),
  });
}

/**
 * Checks if the remote server version is outdated.
 * Uses cached result if within TTL, or fetches fresh if expired or force=true.
 */
export async function checkServerVersionUpdate(
  currentServerVersion: string,
  options: { force?: boolean } = {},
): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}> {
  const cache = loadUpdateCache();
  const isExpired = Date.now() - (cache.checkedAt || 0) > CACHE_TTL_MS;

  let latest = cache.latestDeployVersion;

  if (options.force || isExpired || !latest) {
    const fetched = await fetchUpstreamDeployVersion();
    if (fetched) {
      latest = fetched;
      saveUpdateCache({
        checkedAt: Date.now(),
        latestDeployVersion: fetched,
      });
    }
  }

  if (latest && isNewerVersion(currentServerVersion, latest)) {
    return {
      hasUpdate: true,
      currentVersion: currentServerVersion,
      latestVersion: latest,
    };
  }

  return {
    hasUpdate: false,
    currentVersion: currentServerVersion,
    latestVersion: latest || currentServerVersion,
  };
}

/**
 * Checks if the local CLI version is outdated.
 */
export async function checkCliVersionUpdate(
  currentCliVersion: string,
  options: { force?: boolean } = {},
): Promise<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}> {
  const cache = loadUpdateCache();
  const isExpired = Date.now() - (cache.checkedAt || 0) > CACHE_TTL_MS;

  let latest = cache.latestCliVersion;

  if (options.force || isExpired || !latest) {
    const fetched = await fetchUpstreamCliVersion();
    if (fetched) {
      latest = fetched;
      saveUpdateCache({
        checkedAt: Date.now(),
        latestCliVersion: fetched,
      });
    }
  }

  if (latest && isNewerVersion(currentCliVersion, latest)) {
    return {
      hasUpdate: true,
      currentVersion: currentCliVersion,
      latestVersion: latest,
    };
  }

  return {
    hasUpdate: false,
    currentVersion: currentCliVersion,
    latestVersion: latest || currentCliVersion,
  };
}

/**
 * Prints a clean terminal notice alerting the user to update their remote VPS server.
 */
export function printServerUpdateNotice(
  currentVersion: string,
  latestVersion: string,
): void {
  const lines = [
    `${colors.bold("Update available:")} Explita Deploy Server ${colors.dim(`v${currentVersion}`)} → ${colors.bold(colors.green(`v${latestVersion}`))}`,
    "",
    "To upgrade your remote VPS, SSH into the host and run:",
    `  ${colors.cyan(UPSTREAM_SETUP_SCRIPT_COMMAND)}`,
  ];

  const maxVisibleLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const innerWidth = Math.max(72, maxVisibleLen);
  const border = "─".repeat(innerWidth + 2);

  console.log();
  console.log(colors.yellow(`┌${border}┐`));
  for (const line of lines) {
    const visibleLen = stripAnsi(line).length;
    const padding = " ".repeat(Math.max(0, innerWidth - visibleLen));
    console.log(colors.yellow("│ ") + line + padding + colors.yellow(" │"));
  }
  console.log(colors.yellow(`└${border}┘`));
  console.log();
}

/**
 * Non-blocking routine called when the CLI completes.
 * If an update is known from the cache and cooldown has passed, displays the notice.
 */
export function maybeNotifyAvailableUpdates(): void {
  if (!process.stdout.isTTY) return;

  const cache = loadUpdateCache();
  const serverVer = cache.lastObservedServerVersion;
  const latestVer = cache.latestDeployVersion;

  if (!serverVer || !latestVer) return;

  if (isNewerVersion(serverVer, latestVer)) {
    const lastNotified = cache.lastNotifiedAt || 0;
    if (Date.now() - lastNotified > NOTIFICATION_COOLDOWN_MS) {
      printServerUpdateNotice(serverVer, latestVer);
      saveUpdateCache({ lastNotifiedAt: Date.now() });
    }
  }
}
