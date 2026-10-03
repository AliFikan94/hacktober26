import { Agent } from "@mastra/core/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Any OpenAI-compatible endpoint works. Default: Gemma running locally in Ollama.
const provider = createOpenAICompatible({
  name: "local-gemma",
  baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY ?? "ollama",
});
export let MODEL = process.env.LLM_MODEL ?? "gemma2:9b";

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
function build() {
  for (const [id, s] of Object.entries(STUDENTS)) {
    agents[id as StudentId] = new Agent({ id, name: s.name, instructions: s.instructions, model: provider(MODEL) });
  }
}
build();

/** Switch models at runtime (the UI model picker). */
export function setModel(model: string) { MODEL = model; build(); }
