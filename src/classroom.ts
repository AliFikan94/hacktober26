import { agents, examiner, STUDENTS, type StudentId } from "./students.js";
import type { Agent } from "@mastra/core/agent";

export type Turn = { who: "teacher" | StudentId; text: string };
export type Reply = { id: StudentId; name: string; question: string; understanding: number };
export type TurnEvent = ({ type: "reply" } & Reply) | { type: "error"; id: StudentId; message: string };
export type RubricPoint = { id: string; label: string; point: string; keywords?: { terms: string[]; min: number } };

const firstJson = (raw: string) => raw.match(/\{[\s\S]*\}/)?.[0] ?? null;

/** Strict parse: null when the model did not return the expected JSON. */
export function tryParseReply(raw: string): { question: string; understanding: number } | null {
  const j = firstJson(raw);
  if (!j) return null;
  try {
    const o = JSON.parse(j);
    if (typeof o.question !== "string" || !o.question.trim()) return null;
    return { question: o.question.trim(), understanding: Math.max(0, Math.min(10, Math.round(Number(o.understanding) || 0))) };
  } catch { return null; }
}
/** Lenient parse: falls back to treating the raw text as the question. */
export function parseReply(raw: string): { question: string; understanding: number } {
  return tryParseReply(raw) ?? { question: raw.trim().slice(0, 200) || "Can you say that again?", understanding: 5 };
}

/** Ask an agent for JSON; if the model rambles, retry once with a stricter nudge. */
export async function generateJson<T>(agent: Agent, prompt: string, parse: (raw: string) => T | null) {
  let raw = (await agent.generate(prompt)).text, value = parse(raw), attempts = 1;
  if (value === null) {
    raw = (await agent.generate(prompt + "\n\nYour last answer was not valid JSON. Reply with ONLY the JSON object, nothing else.")).text;
    value = parse(raw); attempts = 2;
  }
  return { value, raw, attempts };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A quote counts if it is really in what the teacher said: verbatim, or a close paraphrase sharing a run of words. */
export function grounded(quote: string, teacherText: string): boolean {
  const said = norm(teacherText), qw = norm(quote).split(" ").filter(Boolean);
  if (qw.length < 3) return false;
  if (said.includes(qw.join(" "))) return true;
  const vocab = new Set(said.split(" "));
  if (qw.filter((w) => vocab.has(w)).length / qw.length < 0.75) return false;
  for (let i = 0; i + 3 <= qw.length; i++) if (said.includes(qw.slice(i, i + 3).join(" "))) return true;
  return false;
}

/**
 * The examiner may only mark an idea covered if its evidence is really in what the teacher said.
 * This stops the model from hallucinating mastery, while tolerating small paraphrases from small models.
 */
export function verifyCoverage(raw: string, rubric: RubricPoint[], teacherText: string): string[] {
  const j = firstJson(raw);
  if (!j) return [];
  let pts: { id?: string; covered?: boolean; quote?: string }[] = [];
  try { pts = JSON.parse(j).points ?? []; } catch { return []; }
  const ok: string[] = [];
  for (const r of rubric) {
    const p = pts.find((x) => x.id === r.id);
    if (p?.covered === true && typeof p.quote === "string" && grounded(p.quote, teacherText)) ok.push(r.id);
  }
  return ok;
}

/** Fallback when the AI judge can't produce usable output: count rubric keywords in what the teacher said. Cruder, and labelled as such. */
export function keywordCoverage(rubric: RubricPoint[], teacherText: string): string[] {
  const t = teacherText.toLowerCase();
  return rubric.filter((r) => r.keywords && r.keywords.terms.filter((x) => new RegExp(x, "i").test(t)).length >= r.keywords.min).map((r) => r.id);
}

export async function examineTurn(rubric: RubricPoint[], teacherText: string): Promise<{ covered: string[]; attempts: number; degraded?: boolean }> {
  const prompt = `RUBRIC (key ideas a good explanation must include):
${rubric.map((r) => `- id "${r.id}": ${r.point}`).join("\n")}

EVERYTHING THE TEACHER HAS SAID SO FAR:
"""
${teacherText}
"""

Reply ONLY with JSON: {"points":[{"id":"<rubric id>","covered":true or false,"quote":"<4 to 15 words copied from the teacher, or empty>"}]} with one entry per rubric id.`;
  const { raw, attempts } = await generateJson(examiner.agent, prompt, (r) => (firstJson(r) ? r : null));
  if (!firstJson(raw)) return { covered: keywordCoverage(rubric, teacherText), attempts, degraded: true }; // judge answered in prose: use the keyword check
  return { covered: verifyCoverage(raw, rubric, teacherText), attempts };
}

/** Like a real class, one or two students chime in per turn. Pick who by what the teacher just said. */
export function chooseSpeakers(utterance: string, last: StudentId | undefined, n: number): StudentId[] {
  const t = utterance.toLowerCase();
  const jargon = (t.match(/\b(variable|function|parameter|argument|operator|index|iterate|boolean|integer|string|float|scope|return|loop|dictionary|exception|syntax|type)s?\b/g) ?? []).length;
  const analogy = /\b(like|imagine|for example|think of|similar to|such as|as if)\b/.test(t);
  const claim = /\b(always|never|every|all|only|must)\b/.test(t);
  const score: Record<StudentId, number> = { maya: 1, kofi: claim ? 2 : 0.5, zee: jargon >= 2 && !analogy ? 3 : 0.5 };
  if (last) score[last] -= 1.5;
  return (Object.keys(score) as StudentId[]).sort((a, b) => score[b] - score[a]).slice(0, Math.max(1, Math.min(3, n)));
}

function transcript(history: Turn[]) {
  return history.map((t) => `${t.who === "teacher" ? "TEACHER" : STUDENTS[t.who].name.toUpperCase()}: ${t.text}`).join("\n");
}

export function studentPrompt(opts: { topic: string; code: string; history: Turn[]; utterance: string; uncovered?: RubricPoint[]; output?: string }) {
  const gaps = opts.uncovered?.length
    ? `\nKey ideas the teacher has NOT explained yet (never reveal this list; when natural, steer your question toward one of them):\n${opts.uncovered.map((r) => `- ${r.point}`).join("\n")}\n` : "";
  return `Topic being taught: ${opts.topic}

Code on the shared screen:
\`\`\`python
${opts.code}
\`\`\`

Terminal (what appeared when the teacher last ran this code):
${opts.output?.trim() ? opts.output.trim().slice(0, 800) : "(they haven't run it yet)"}

Conversation so far:
${transcript(opts.history) || "(none yet)"}
${gaps}
TEACHER just said: ${opts.utterance}

Respond as yourself.`;
}

/** One teaching turn: all three students react in parallel, each streamed as it lands. */
export async function classroomTurn(opts: {
  topic: string; code: string; history: Turn[]; utterance: string; uncovered?: RubricPoint[]; output?: string; speakers?: StudentId[];
}, onEvent?: (e: TurnEvent) => void): Promise<Reply[]> {
  const prompt = studentPrompt(opts);
  const ids = opts.speakers?.length ? opts.speakers : (Object.keys(agents) as StudentId[]);
  const replies: Reply[] = [];
  await Promise.all(ids.map(async (id) => {
    try {
      const { value, raw } = await generateJson(agents[id], prompt, tryParseReply);
      const r: Reply = { id, name: STUDENTS[id].name, ...(value ?? parseReply(raw)) };
      replies.push(r); onEvent?.({ type: "reply", ...r });
    } catch (e) { onEvent?.({ type: "error", id, message: String((e as Error).message ?? e) }); }
  }));
  return ids.flatMap((id) => replies.filter((r) => r.id === id));
}
