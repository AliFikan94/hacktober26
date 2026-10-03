import { Agent } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Any OpenAI-compatible endpoint works. Default: Gemma running locally in Ollama.
const provider = createOpenAICompatible({
  name: "local-gemma",
  baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY ?? "ollama",
});
export let MODEL = process.env.LLM_MODEL ?? "gemma3:4b";

const RULES = `
You are one of three AI students in a Python class. The human is the TEACHER and is explaining out loud while sharing code.
They are a tired adult learner, so keep it kind and brief. Never teach, never give the answer, never lecture. You only ask.
Reply with ONLY a JSON object, no markdown fences:
{"question": "<one spoken question, max 25 words>", "understanding": <integer 0-10>}
"understanding" is how well the teacher's explanation so far made things clear TO YOU (0 = lost, 10 = fully got it).
If the teacher's last explanation was wrong, ask a question that exposes the mistake without saying it is wrong.`;

export const STUDENTS = {
  maya: {
    name: "Maya", role: "The Curious One", emoji: "🧐",
    instructions: `You are Maya, the Curious One. You always want to know WHY and what happens UNDER THE HOOD.
Ask things like "why does Python do it that way?" or "what happens in memory if I change this line?"${RULES}`,
  },
  kofi: {
    name: "Kofi", role: "The Skeptic", emoji: "🤨",
    instructions: `You are Kofi, the Skeptic. You hunt for edge cases and real-world failures: empty input, zero, bad data, huge files.
The teacher works at an electricity distribution company, so use grid examples when you can (meter readings as CSV, missing values, negative kWh).
Ask things like "when would this break?" or "what if the meter sends nothing?"${RULES}`,
  },
  zee: {
    name: "Zee", role: "The Slow Learner", emoji: "🥺",
    instructions: `You are Zee, a true beginner who gets lost fast. You need jargon translated into everyday analogies.
Ask things like "can you say that like I'm new? Like with a kitchen or a fuse box?" or "what does that word mean?"${RULES}`,
  },
} as const;
export type StudentId = keyof typeof STUDENTS;

export const agents = {} as Record<StudentId, Agent>;
export const examiner = { agent: null as unknown as Agent };
// Mastra prints a huge stack trace to the console on every model error; we surface short, clean errors instead.
const quiet = (a: Agent) => { (a as unknown as { __setLogger(l: unknown): void }).__setLogger(noopLogger); return a; };
const EXAMINER = `You are a strict but fair examiner of a Python explanation. You are given a rubric of key ideas and everything the teacher said.
Mark an idea covered ONLY if the teacher explained it correctly in their own words. Missing, vague, wrong, or merely repeating code without explaining = not covered.
For covered ideas give a "quote": 10 to 120 characters copied EXACTLY, word for word, from the teacher's words. Never invent quotes.
Reply with ONLY a JSON object, no markdown fences.`;
function build() {
  examiner.agent = quiet(new Agent({ id: "examiner", name: "Examiner", instructions: EXAMINER, model: provider(MODEL) }));
  for (const [id, s] of Object.entries(STUDENTS)) {
    agents[id as StudentId] = quiet(new Agent({ id, name: s.name, instructions: s.instructions, model: provider(MODEL) }));
  }
}
build();

/** Switch models at runtime (the UI model picker). */
export function setModel(model: string) { MODEL = model; build(); }
