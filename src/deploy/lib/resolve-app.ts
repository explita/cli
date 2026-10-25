import {
  loadProjectConfig,
  PROJECT_CONFIG_FILENAME,
} from "@explita/infra-protocol";
import { parseArgs, type ParseArgsConfig } from "node:util";

/**
 * Attempts to resolve the target application ID.
 * Returns undefined if neither explicit -a/--app nor deploy.appId exists.
 */
export function tryResolveAppId(explicitAppId?: string): string | undefined {
  const trimmed = explicitAppId?.trim();
  if (trimmed) {
    return trimmed;
  }

  return loadProjectConfig()?.config.deploy?.appId?.trim() || undefined;
}

/**
 * Resolves the target application ID.
 * Hierarchy:
 * 1. Explicit -a/--app <appId> flag.
 * 2. deploy.appId defined in local explita.json.
 * 3. Throws an error directing the user to supply the ID or configure it.
 */
export function resolveAppId(
  explicitAppId?: string,
  actionName?: string,
): string {
  const resolved = tryResolveAppId(explicitAppId);
  if (resolved) {
    return resolved;
  }

  const contextStr = actionName ? ` for "${actionName}"` : "";
  throw new Error(
    `Application ID is required${contextStr}. Provide -a/--app <appId> or define deploy.appId in ${PROJECT_CONFIG_FILENAME}.`,
  );
}

/**
 * Parses command args with standard -a/--app support and resolves the target appId.
 * Set config.optional to true for commands that can fall back to all/system scope.
 */
export function parseAppCommand(
  args: string[],
  actionName: string,
  options: NonNullable<ParseArgsConfig["options"]> | undefined,
  config: { optional: true },
): {
  appId: string | undefined;
  positionals: string[];
  values: Record<string, any>;
};
export function parseAppCommand(
  args: string[],
  actionName?: string,
  options?: NonNullable<ParseArgsConfig["options"]>,
  config?: { optional?: false },
): { appId: string; positionals: string[]; values: Record<string, any> };
export function parseAppCommand(
  args: string[],
  actionName?: string,
  options?: NonNullable<ParseArgsConfig["options"]>,
  config?: { optional?: boolean },
): {
  appId: string | undefined;
  positionals: string[];
  values: Record<string, any>;
} {
  const { values, positionals } = parseArgs({
    args,
    options: {
      app: { type: "string", short: "a" },
      help: { type: "boolean", short: "h" },
      ...options,
    },
    allowPositionals: true,
  });

  const appId =
    values.help || config?.optional
      ? tryResolveAppId(values.app as string | undefined)
      : resolveAppId(values.app as string | undefined, actionName);

  return { appId, positionals, values };
}
