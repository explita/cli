import { askQuestion, askConfirm, type AskConfirmOptions, type AskPromptOptions } from "../../lib/prompt.js";

export { askConfirm, askQuestion, type AskConfirmOptions, type AskPromptOptions };

export type PreviewAction = "promote" | "keep" | "discard";

export function resolvePreviewAction(input: string): PreviewAction {
  const trimmed = input.trim().toLowerCase();

  if (
    trimmed === "y" ||
    trimmed === "yes" ||
    trimmed === "p" ||
    trimmed === "promote"
  ) {
    return "promote";
  }

  if (
    trimmed === "d" ||
    trimmed === "discard" ||
    trimmed === "delete" ||
    trimmed === "rm"
  ) {
    return "discard";
  }

  // Default: keep preview active (Enter / empty, "k", "keep", "n", "no", etc.)
  return "keep";
}

export async function askPreviewAction(
  promptText = "Promote to production? [y: promote, k: keep preview (default), d: discard]: ",
): Promise<PreviewAction> {
  const answer = await askQuestion(promptText);
  return resolvePreviewAction(answer);
}
