// Shared by the server and `npm run doctor`: find out what Ollama has installed and choose a usable model.
import { MODEL, setModel } from "./students.js";

export const OLLAMA = process.env.OLLAMA_HOST ?? (process.env.LLM_BASE_URL ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, "");
export const explicitModel = !!process.env.LLM_MODEL;
export const isCloudName = (n: string) => /(^|[-:])cloud$/.test(n);

export async function installedModels(): Promise<string[] | null> {
  try {
    const d = (await (await fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(3000) })).json()) as { models?: { name: string }[] };
    return (d.models ?? []).map((m) => m.name);
  } catch { return null; }
}

/** Prefer a local Gemma, then any local model, then a cloud model. Embedding models are never chosen. */
export function pickModel(names: string[]): string | undefined {
  const usable = names.filter((n) => !/embed/i.test(n));
  return usable.find((n) => /gemma/i.test(n) && !isCloudName(n)) ?? usable.find((n) => !isCloudName(n)) ?? usable[0];
}

export const hasModel = (names: string[], m: string) => names.some((n) => n === m || n === m + ":latest");

/** If the current model isn't installed and the user didn't choose one on purpose, switch to a sensible installed one. */
export function autoSelect(names: string[] | null, userPicked = false): { switchedTo?: string; missing: boolean } {
  if (!names || hasModel(names, MODEL)) return { missing: false };
  const pick = !explicitModel && !userPicked ? pickModel(names) : undefined;
  if (pick) { setModel(pick); return { switchedTo: pick, missing: false }; }
  return { missing: true };
}
