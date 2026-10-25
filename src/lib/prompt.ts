import * as readline from "node:readline/promises";
import { stdin as defaultStdin, stdout as defaultStdout } from "node:process";

export interface AskPromptOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export interface AskConfirmOptions extends AskPromptOptions {
  defaultYes?: boolean;
}

/**
 * Ask a general text question to the user in the terminal.
 * Returns the entered string (trimmed), or an empty string if aborted via SIGINT.
 */
export async function askQuestion(
  promptText: string,
  options?: AskPromptOptions,
): Promise<string> {
  const input = (options?.input ?? defaultStdin) as NodeJS.ReadableStream;
  const output = (options?.output ?? defaultStdout) as NodeJS.WritableStream;

  const rl = readline.createInterface({
    input,
    output,
  });

  let aborted = false;
  const sigintHandler = () => {
    aborted = true;
    rl.close();
  };

  process.once("SIGINT", sigintHandler);

  try {
    const answer = await rl.question(promptText);
    process.removeListener("SIGINT", sigintHandler);
    return answer.trim();
  } catch (err) {
    process.removeListener("SIGINT", sigintHandler);
    if (aborted) {
      return "";
    }
    throw err;
  } finally {
    rl.close();
  }
}

/**
 * Universally prompt for a yes/no confirmation [y/N] or [Y/n].
 *
 * @param question The question text to display to the user.
 * @param options Boolean (for defaultYes) or AskConfirmOptions configuration.
 * @returns boolean (true for yes/confirmed, false for no/cancelled)
 */
export async function askConfirm(
  question: string,
  options?: AskConfirmOptions | boolean,
): Promise<boolean> {
  const defaultYes =
    typeof options === "boolean" ? options : Boolean(options?.defaultYes);
  const promptOptions: AskPromptOptions =
    typeof options === "object" && options !== null ? options : {};

  // If question doesn't already contain brackets for choices, append the appropriate hint
  let formatted = question;
  if (!formatted.includes("[") || !formatted.includes("]")) {
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    formatted = `${formatted.trimEnd()} ${suffix} `;
  } else if (!formatted.endsWith(" ")) {
    formatted = `${formatted} `;
  }

  const answer = await askQuestion(formatted, promptOptions);
  if (answer === "") {
    return defaultYes;
  }

  const lower = answer.toLowerCase();
  return lower === "y" || lower === "yes";
}
