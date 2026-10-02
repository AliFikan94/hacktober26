// Smoke test: fake OpenAI-compatible LLM -> full classroom turn through Mastra agents.
import { createServer } from "node:http";
const fake = createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c;
  const sys = JSON.parse(b).messages?.[0]?.content ?? "";
  const who = /Maya/.test(sys) ? "maya" : /Kofi/.test(sys) ? "kofi" : "zee";
  const text = JSON.stringify({ question: `question from ${who}`, understanding: 6 });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "m",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
}).listen(0);
await new Promise((r) => fake.once("listening", r));
process.env.LLM_BASE_URL = `http://localhost:${(fake.address() as any).port}/v1`;
const { classroomTurn } = await import("./classroom.js");
const replies = await classroomTurn({ topic: "t", code: "print(1)", history: [], utterance: "it prints one" });
console.log(replies);
if (replies.length !== 3 || replies.some((r) => !r.question.startsWith("question from"))) process.exit(1);
console.log("OK"); fake.close(); process.exit(0);
