// Shared by the server and `npm run doctor`: find out what Ollama has installed and choose a model that fits this computer.
import { freemem } from "node:os";
import { MODEL, setModel } from "./students.js";

export const OLLAMA = process.env.OLLAMA_HOST ?? (process.env.LLM_BASE_URL ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, "");
export const explicitModel = !!process.env.LLM_MODEL;
export type Installed = { name: string; size: number };

export const isCloudName = (n: string) => /(^|[-:])cloud$/.test(n);
export const freeBytes = () => (process.env.TB_FREE_BYTES ? Number(process.env.TB_FREE_BYTES) : freemem());
/** A local model needs roughly its file size plus ~30% for context. Cloud models need no local memory. */
export const fits = (m: Installed, free = freeBytes()) => isCloudName(m.name) || m.size === 0 || m.size * 1.3 <= free;
export const names = (l: Installed[]) => l.map((m) => m.name);
export const findModel = (l: Installed[], n: string) => l.find((m) => m.name === n || m.name === n + ":latest");

export async function installedModels(): Promise<Installed[] | null> {
  try {
    const d = (await (await fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(3000) })).json()) as { models?: { name: string; size?: number }[] };
    return (d.models ?? []).map((m) => ({ name: m.name, size: m.size ?? 0 }));
  } catch { return null; }
}

/** Prefer the biggest local Gemma that fits in memory, then any local model that fits, then a cloud model. */
export function pickModel(list: Installed[], free = freeBytes()): string | undefined {
  const usable = list.filter((m) => !/embed/i.test(m.name));
  const fit = usable.filter((m) => !isCloudName(m.name) && m.size > 0 && fits(m, free)).sort((a, b) => b.size - a.size);
  return fit.find((m) => /gemma/i.test(m.name))?.name ?? fit[0]?.name ?? usable.find((m) => isCloudName(m.name))?.name
    ?? usable.filter((m) => m.size > 0).sort((a, b) => a.size - b.size)[0]?.name ?? usable[0]?.name;
}

export type Selection = { switchedTo?: string; reason?: "missing" | "memory"; missing: boolean };
/** Switch away from a model that is missing or too big for this computer, unless the user chose it on purpose. */
export function autoSelect(list: Installed[] | null, userPicked = false): Selection {
  if (!list) return { missing: false };
  const cur = findModel(list, MODEL), auto = !explicitModel && !userPicked;
  if (cur && fits(cur)) return { missing: false };
  const pick = auto ? pickModel(list) : undefined;
  if (pick && pick !== cur?.name && pick !== MODEL) { setModel(pick); return { switchedTo: pick, reason: cur ? "memory" : "missing", missing: false }; }
  return { missing: !cur };
}

export function friendlyModelError(msg: string): string {
  if (/more system memory/i.test(msg)) return `This computer doesn't have enough free memory for "${MODEL}". Close other apps, or use a smaller model: ollama pull gemma3:1b`;
  return msg.split("\n")[0].slice(0, 200);
}
