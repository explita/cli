import type { RequestRingBuffer } from "./ring-buffer.js";
import { replayRequest } from "./replay.js";
import { colors } from "@explita/infra-protocol";

export interface KeyboardHandlerOptions {
  localPort: number;
  ringBuffer: RequestRingBuffer;
  enableReplay?: boolean;
  enableWireToggle?: boolean;
  onToggleWire?: () => boolean;
  onReplayResult: (info: {
    method: string;
    path: string;
    status: number;
    duration: number;
    detail?: string;
  }) => void;
  onClearScreen: () => void;
  onExit: () => void;
}

export function attachKeyboardShortcuts(
  options: KeyboardHandlerOptions,
): () => void {
  const {
    localPort,
    ringBuffer,
    enableReplay = true,
    enableWireToggle = true,
    onToggleWire,
    onReplayResult,
    onClearScreen,
    onExit,
  } = options;

  if (!process.stdin.isTTY) {
    return () => {};
  }

  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
  } catch {
    return () => {};
  }

  let isReplaying = false;

  const onData = async (chunk: string) => {
    // Ctrl+C
    if (chunk === "\u0003") {
      onExit();
      return;
    }

    const key = chunk.trim().toLowerCase();

    if (key === "r") {
      if (!enableReplay) {
        console.log(
          `\n${colors.yellow("!")} ${colors.dim("Replay is disabled because inspector is off.")}`,
        );
        return;
      }
      if (isReplaying) return;
      const last = ringBuffer.getLast();
      if (!last) {
        console.log(
          `\n${colors.yellow("!")} ${colors.dim("No requests recorded yet to replay.")}`,
        );
        return;
      }

      isReplaying = true;
      try {
        console.log(
          `\n${colors.cyan("⚡")} ${colors.bold("Replaying:")} ${colors.bold(last.method)} ${last.path}...`,
        );
        const result = await replayRequest(last, localPort, ringBuffer);
        onReplayResult({
          method: last.method,
          path: last.path,
          status: result.status,
          duration: result.duration,
          detail: result.error,
        });
      } finally {
        isReplaying = false;
      }
      return;
    }

    if (key === "w") {
      if (!enableWireToggle || !onToggleWire) {
        console.log(
          `\n${colors.yellow("!")} ${colors.dim("Wire inspection is disabled because inspector is off.")}`,
        );
        return;
      }
      const active = onToggleWire();
      if (active) {
        console.log(
          `\n${colors.cyan("⚡")} ${colors.bold("Wire logging enabled")} ${colors.dim("(showing raw frames)")}`,
        );
      } else {
        console.log(
          `\n${colors.cyan("⚡")} ${colors.bold("Wire logging disabled")}`,
        );
      }
      return;
    }

    if (key === "c") {
      console.clear();
      onClearScreen();
      return;
    }

    if (key === "h" || key === "?") {
      console.log(`\n${colors.cyan(colors.bold("Terminal Shortcuts:"))}`);
      if (enableReplay) {
        console.log(
          `  ${colors.bold("[r]")} Replay the most recent request to localhost:${localPort}`,
        );
      }
      if (enableWireToggle) {
        console.log(
          `  ${colors.bold("[w]")} Toggle live wire logging (show raw encrypted/decrypted frames)`,
        );
      }
      console.log(
        `  ${colors.bold("[c]")} Clear the console screen and reprint status`,
      );
      console.log(`  ${colors.bold("[h]")} Show this help message`);
      console.log(`  ${colors.bold("[Ctrl+C]")} Stop tunnel\n`);
    }
  };

  process.stdin.on("data", onData);

  return () => {
    try {
      process.stdin.off("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
    } catch {
      // Ignore cleanup error
    }
  };
}
