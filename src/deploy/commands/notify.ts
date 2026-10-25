import {
  loadProjectConfig,
  saveProjectConfig,
  type NotificationConfig,
  formatDiscordPayload,
  formatSlackPayload,
  formatTelegramPayload,
  resolveTelegramDetails,
  PRODUCT_NAME,
  colors,
} from "@explita/infra-protocol";
import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";

import { printCmdAndDec } from "../../lib/utils.js";

function printNotifyHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Notify`,
    desc: "Incident & health alerts (Discord, Telegram, Slack)",
    commands: [
      ["eda notify", "Show configured notification destinations"],
      [
        "eda notify ls [-a <appId>]",
        "Show configured notification destinations",
      ],
      [
        "eda notify set [options] [-a <appId>]",
        "Configure alert webhooks & Telegram chat",
      ],
      ["eda notify rm [options] [-a <appId>]", "Remove alert destinations"],
      [
        "eda notify test [options] [-a <appId>]",
        "Send a test alert notification",
      ],
    ],
    options: [
      ["--discord <url>", "Discord incoming webhook URL"],
      ["--slack <url>", "Slack incoming webhook URL"],
      ["--telegram <chat_id>", "Telegram chat ID (or botToken:chatId)"],
      ["--telegram-token <token>", "Telegram Bot API token"],
      ["--events <list>", "Comma-separated list of events to alert on"],
      ["-a, --app <appId>", "Target application ID"],
      ["--all", "Remove all alert destinations (for rm)"],
      ["-h, --help", "Show help"],
    ],
    footerNote: `Events:
  • deployment_failed     Deployment failed (with build error snippet)
  • container_unhealthy   Container crashed, exited, OOM killed, or failed health check
  • cron_failed          Scheduled background cron job failed (exit code != 0)
  • backup_completed     Automated database backup completed successfully
  • backup_failed        Automated database backup failed`,
  });
}

export function formatNotifyConfig(
  config: NotificationConfig | undefined | null,
  appId?: string,
): string {
  const lines: string[] = [];
  lines.push(`\n${colors.bold("Incident & Health Alerts:")}`);
  if (appId) {
    lines.push(`  ${colors.dim("Application:")} ${colors.bold(appId)}`);
  }

  if (!config || (!config.discord && !config.slack && !config.telegram)) {
    lines.push(`  ${colors.dim("(No alert destinations configured)")}`);
    lines.push(
      `\n  ${colors.dim("To configure:")}\n    eda notify set --discord <webhook_url>\n    eda notify set --telegram <chat_id>\n    eda notify set --slack <webhook_url>`,
    );
    return lines.join("\n");
  }

  // Discord
  if (config.discord) {
    const masked =
      config.discord.length > 45
        ? `${config.discord.slice(0, 35)}...${config.discord.slice(-6)}`
        : config.discord;
    lines.push(
      `  ${colors.bold("Discord :")} ${colors.green("✔")} ${colors.cyan(masked)}`,
    );
  } else {
    lines.push(
      `  ${colors.bold("Discord :")} ${colors.dim("(not configured)")}`,
    );
  }

  // Slack
  if (config.slack) {
    const masked =
      config.slack.length > 45
        ? `${config.slack.slice(0, 35)}...${config.slack.slice(-6)}`
        : config.slack;
    lines.push(
      `  ${colors.bold("Slack   :")} ${colors.green("✔")} ${colors.cyan(masked)}`,
    );
  } else {
    lines.push(
      `  ${colors.bold("Slack   :")} ${colors.dim("(not configured)")}`,
    );
  }

  // Telegram
  if (config.telegram) {
    const chatId =
      typeof config.telegram === "string"
        ? config.telegram
        : config.telegram.chatId;
    const hasToken =
      typeof config.telegram === "object" && Boolean(config.telegram.token);
    const tokenInfo = hasToken
      ? colors.dim(" (bot token configured)")
      : process.env.EXPLITA_TELEGRAM_BOT_TOKEN
        ? colors.dim(" (bot token via env)")
        : colors.yellow(" (⚠️ bot token not set)");
    lines.push(
      `  ${colors.bold("Telegram:")} ${colors.green("✔")} Chat ID: ${colors.cyan(chatId)}${tokenInfo}`,
    );
  } else {
    lines.push(
      `  ${colors.bold("Telegram:")} ${colors.dim("(not configured)")}`,
    );
  }

  // Events
  if (config.events && config.events.length > 0) {
    lines.push(
      `  ${colors.bold("Events  :")} ${colors.cyan(config.events.join(", "))}`,
    );
  } else {
    lines.push(
      `  ${colors.bold("Events  :")} ${colors.dim("All events (deployment_failed, container_unhealthy, cron_failed, backup_completed, backup_failed)")}`,
    );
  }

  return lines.join("\n");
}

function preprocessArgs(args: string[]): string[] {
  const processed: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const curr = args[i];
    const next = args[i + 1];
    if (
      (curr === "--telegram" || curr === "-t") &&
      next &&
      !next.startsWith("--") &&
      next.startsWith("-")
    ) {
      processed.push(`--telegram=${next}`);
      i++;
    } else {
      processed.push(curr);
    }
  }
  return processed;
}

export async function runNotifyCommand(args: string[]): Promise<void> {
  const normalizedArgs = preprocessArgs(args);
  const first = normalizedArgs[0]?.toLowerCase();

  if (first === "--help" || first === "-h") {
    printNotifyHelp();
    return;
  }

  const subCommand =
    first === "ls" ||
    first === "set" ||
    first === "rm" ||
    first === "clear" ||
    first === "test"
      ? first
      : undefined;

  const commandArgs = subCommand ? normalizedArgs.slice(1) : normalizedArgs;

  switch (subCommand) {
    case undefined:
    case "ls": {
      const { appId } = parseAppCommand(commandArgs, "notify ls", undefined, {
        optional: true,
      });

      // Check local project config first
      const projectConf = loadProjectConfig()?.config.deploy;
      let notifyConf: NotificationConfig | undefined | null =
        projectConf?.notify;

      // If app is known, attempt to fetch latest from server
      if (appId) {
        try {
          const remote = await api<NotificationConfig | null>(
            `/api/apps/${encodeURIComponent(appId)}/notify`,
          );
          if (remote) {
            notifyConf = remote;
          }
        } catch {
          // Fall back to local config
        }
      }

      console.log(formatNotifyConfig(notifyConf, appId));
      console.log();
      break;
    }

    case "set": {
      const { values, appId } = parseAppCommand(
        commandArgs,
        "notify set",
        {
          discord: { type: "string", short: "d" },
          slack: { type: "string", short: "s" },
          telegram: { type: "string", short: "t" },
          "telegram-token": { type: "string", short: "T" },
          events: { type: "string", short: "e" },
        },
        { optional: true },
      );

      const discord = values.discord as string | undefined;
      const slack = values.slack as string | undefined;
      const telegram = values.telegram as string | undefined;
      const telegramToken = values["telegram-token"] as string | undefined;
      const rawEvents = values.events as string | undefined;

      if (!discord && !slack && !telegram && !telegramToken && !rawEvents) {
        printNotifyHelp();
        throw new Error(
          "No alert destination specified. Provide at least one of --discord, --telegram, or --slack.",
        );
      }

      const existingProjectConf = loadProjectConfig()?.config.deploy;
      const currentNotify: NotificationConfig = {
        ...(existingProjectConf?.notify || {}),
      };

      if (discord !== undefined) {
        currentNotify.discord = discord.trim();
      }
      if (slack !== undefined) {
        currentNotify.slack = slack.trim();
      }

      if (telegram !== undefined || telegramToken !== undefined) {
        const prevChatId =
          typeof currentNotify.telegram === "string"
            ? currentNotify.telegram
            : currentNotify.telegram?.chatId;
        const prevToken =
          typeof currentNotify.telegram === "object"
            ? currentNotify.telegram?.token
            : undefined;

        const finalChatId = (telegram ? telegram.trim() : prevChatId) || "";
        const finalToken =
          (telegramToken ? telegramToken.trim() : prevToken) || undefined;

        if (finalToken) {
          currentNotify.telegram = {
            chatId: finalChatId,
            token: finalToken,
          };
        } else {
          currentNotify.telegram = finalChatId;
        }
      }

      if (rawEvents !== undefined) {
        currentNotify.events = rawEvents
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // Save to local project config
      const saved = saveProjectConfig({
        deploy: {
          notify: currentNotify,
        },
      });

      console.log(
        `\n${colors.green("✔")} Updated alert notifications in ${colors.bold(saved.path)}`,
      );

      // If target application exists on remote deploy server, sync directly
      if (appId) {
        try {
          await api(`/api/apps/${encodeURIComponent(appId)}/notify`, {
            method: "POST",
            body: JSON.stringify(currentNotify),
          });
          console.log(
            `  ${colors.green("✔")} Synchronized with live application ${colors.bold(appId)} on server`,
          );
        } catch (err) {
          console.log(
            `  ${colors.dim(`(Notice: Remote app "${appId}" not updated: ${err instanceof Error ? err.message : String(err)})`)}`,
          );
        }
      }

      console.log(formatNotifyConfig(currentNotify, appId));
      console.log();
      break;
    }

    case "rm":
    case "clear": {
      const { values, appId } = parseAppCommand(
        commandArgs,
        "notify rm",
        {
          discord: { type: "boolean", short: "d" },
          slack: { type: "boolean", short: "s" },
          telegram: { type: "boolean", short: "t" },
          all: { type: "boolean", short: "a" },
        },
        { optional: true },
      );

      const isAll = Boolean(values.all);
      const rmDiscord = Boolean(values.discord) || isAll;
      const rmSlack = Boolean(values.slack) || isAll;
      const rmTelegram = Boolean(values.telegram) || isAll;

      if (!rmDiscord && !rmSlack && !rmTelegram) {
        throw new Error(
          "Specify which alert destination to remove: --discord, --telegram, --slack, or --all",
        );
      }

      const existingProjectConf = loadProjectConfig()?.config.deploy;
      const currentNotify: NotificationConfig = {
        ...(existingProjectConf?.notify || {}),
      };

      if (rmDiscord) delete currentNotify.discord;
      if (rmSlack) delete currentNotify.slack;
      if (rmTelegram) delete currentNotify.telegram;
      if (isAll) delete currentNotify.events;

      const hasRemaining = Boolean(
        currentNotify.discord || currentNotify.slack || currentNotify.telegram,
      );

      const updatePayload = hasRemaining ? currentNotify : undefined;

      saveProjectConfig({
        deploy: {
          notify: updatePayload,
        },
      });

      console.log(`\n${colors.green("✔")} Removed notification destinations.`);

      if (appId) {
        try {
          await api(`/api/apps/${encodeURIComponent(appId)}/notify`, {
            method: hasRemaining ? "POST" : "DELETE",
            ...(hasRemaining ? { body: JSON.stringify(currentNotify) } : {}),
          });
          console.log(
            `  ${colors.green("✔")} Updated live application ${colors.bold(appId)} on server`,
          );
        } catch {
          // Ignore remote update failure
        }
      }
      console.log();
      break;
    }

    case "test": {
      const { appId, values } = parseAppCommand(
        commandArgs,
        "notify test",
        {
          discord: { type: "string", short: "d" },
          slack: { type: "string", short: "s" },
          telegram: { type: "string", short: "t" },
          "telegram-token": { type: "string", short: "T" },
        },
        { optional: true },
      );

      const projectConf = loadProjectConfig()?.config.deploy;
      const customConfig: NotificationConfig = {
        ...(projectConf?.notify || {}),
      };

      if (values.discord) customConfig.discord = String(values.discord).trim();
      if (values.slack) customConfig.slack = String(values.slack).trim();
      if (values.telegram) {
        customConfig.telegram = {
          chatId: String(values.telegram).trim(),
          ...(values["telegram-token"]
            ? { token: String(values["telegram-token"]).trim() }
            : {}),
        };
      }

      if (
        !customConfig.discord &&
        !customConfig.slack &&
        !customConfig.telegram
      ) {
        throw new Error(
          "No alert destinations configured to test. Provide --discord, --telegram, or configure in explita.json first.",
        );
      }

      console.log(`\n${colors.cyan("⏳")} Sending test alert notification...`);

      if (appId) {
        try {
          const res = await api<{
            discord?: boolean;
            slack?: boolean;
            telegram?: boolean;
            errors: string[];
          }>(`/api/apps/${encodeURIComponent(appId)}/notify/test`, {
            method: "POST",
            body: JSON.stringify(customConfig),
          });

          if (res.discord)
            console.log(`  ${colors.green("✔")} Discord webhook delivered`);
          if (res.slack)
            console.log(`  ${colors.green("✔")} Slack webhook delivered`);
          if (res.telegram)
            console.log(`  ${colors.green("✔")} Telegram message delivered`);

          if (res.errors && res.errors.length > 0) {
            for (const err of res.errors) {
              console.log(`  ${colors.red("✖")} ${err}`);
              if (typeof err === "string" && err.includes("chat not found")) {
                console.log(
                  `    ${colors.yellow("💡 Tip:")} You must open your bot in Telegram (https://t.me/explita_alerts_bot) and press ${colors.bold("/start")} first so it has permission to message you.`,
                );
              }
            }
          }
          console.log();
          return;
        } catch {
          // If remote API is not available, try direct dispatch fallback
        }
      }

      // Direct client-side dispatch
      const payload = {
        event: "container_healthy" as const,
        title: "🔔 Explita Alerts Test",
        level: "info" as const,
        appName: projectConf?.name || "test-app",
        appId: appId || "test-app",
        description:
          "Success! Your notification channels are connected to Explita Deploy.",
        details: {
          serverTime: new Date().toISOString(),
        },
      };

      if (customConfig.discord) {
        try {
          const body = formatDiscordPayload(payload);
          const res = await fetch(customConfig.discord, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            console.log(`  ${colors.green("✔")} Discord webhook delivered`);
          } else {
            console.log(
              `  ${colors.red("✖")} Discord webhook returned status ${res.status}`,
            );
          }
        } catch (e: any) {
          console.log(`  ${colors.red("✖")} Discord error: ${e.message}`);
        }
      }

      if (customConfig.slack) {
        try {
          const body = formatSlackPayload(payload);
          const res = await fetch(customConfig.slack, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            console.log(`  ${colors.green("✔")} Slack webhook delivered`);
          } else {
            console.log(
              `  ${colors.red("✖")} Slack webhook returned status ${res.status}`,
            );
          }
        } catch (e: any) {
          console.log(`  ${colors.red("✖")} Slack error: ${e.message}`);
        }
      }

      if (customConfig.telegram) {
        const { chatId, token } = resolveTelegramDetails(customConfig);

        if (!chatId || !token) {
          console.log(
            `  ${colors.yellow("⚠️")} Telegram test skipped: chat ID or token missing.`,
          );
        } else {
          try {
            const body = formatTelegramPayload(payload, chatId);

            const res = await fetch(
              `https://api.telegram.org/bot${token}/sendMessage`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              },
            );
            if (res.ok) {
              console.log(`  ${colors.green("✔")} Telegram message delivered`);
            } else {
              const data = await res.json().catch(() => null);
              const desc = data?.description ? `: ${data.description}` : "";
              console.log(
                `  ${colors.red("✖")} Telegram API returned status ${res.status}${desc}`,
              );
              if (data?.description?.includes("chat not found")) {
                console.log(
                  `    ${colors.yellow("💡 Tip:")} You must open your bot in Telegram and press ${colors.bold("/start")} first so it has permission to message you.`,
                );
              }
            }
          } catch (e: any) {
            console.log(`  ${colors.red("✖")} Telegram error: ${e.message}`);
          }
        }
      }

      console.log();
      break;
    }

    default:
      printNotifyHelp();
      throw new Error(`Unknown notify command: ${subCommand}`);
  }
}
