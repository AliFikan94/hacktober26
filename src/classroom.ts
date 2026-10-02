import { agents, STUDENTS, type StudentId } from "./students.js";

export type Turn = { who: "teacher" | StudentId; text: string };
export type Reply = { id: StudentId; name: string; question: string; understanding: number };

export function parseReply(raw: string): { question: string; understanding: number } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (typeof j.question === "string") {
        const u = Math.max(0, Math.min(10, Math.round(Number(j.understanding) || 0)));
        return { question: j.question.trim(), understanding: u };
      }
    } catch { /* fall through */ }
  }
  return { question: raw.trim().slice(0, 200) || "Can you say that again?", understanding: 5 };
}

function transcript(history: Turn[]) {
  return history.map((t) => `${t.who === "teacher" ? "TEACHER" : STUDENTS[t.who].name.toUpperCase()}: ${t.text}`).join("\n");
}

/** One teaching turn: all three students react in parallel, each with its own personality. */
export async function classroomTurn(opts: {
  topic: string; code: string; history: Turn[]; utterance: string;
}): Promise<Reply[]> {
  const prompt = `Topic being taught: ${opts.topic}

Code on the shared screen:
\`\`\`python
${opts.code}
\`\`\`

Conversation so far:
${transcript(opts.history) || "(none yet)"}

TEACHER just said: ${opts.utterance}

Respond as yourself.`;
  const ids = Object.keys(agents) as StudentId[];
  return Promise.all(ids.map(async (id) => {
    const res = await agents[id].generate(prompt);
    return { id, name: STUDENTS[id].name, ...parseReply(res.text) };
  }));
}
