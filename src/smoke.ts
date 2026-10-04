// Tests with a fake OpenAI-compatible LLM (no Ollama needed).
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
const { classroomTurn, verifyCoverage, tryParseReply, chooseSpeakers } = await import("./classroom.js");
const fail = (m: string) => { console.error("FAIL: " + m); process.exit(1); };

const replies = await classroomTurn({ topic: "t", code: "print(1)", history: [], utterance: "it prints one" });
if (replies.length !== 3 || replies.some((r) => !r.question.startsWith("question from"))) fail("classroomTurn");
console.log("classroomTurn OK");

const rubric = [{ id: "a", label: "A", point: "pa" }, { id: "b", label: "B", point: "pb" }, { id: "c", label: "C", point: "pc" }];
const said = "A variable is basically a name that I stick on a value.\nValues have types like int and float.";
const raw = (pts: unknown[]) => "Sure! " + JSON.stringify({ points: pts });
const cases: [string, string, string[]][] = [
  ["valid quote", raw([{ id: "a", covered: true, quote: "a name that I stick on a value" }]), ["a"]],
  ["case/punctuation tolerant", raw([{ id: "b", covered: true, quote: "VALUES have types, like int and float!" }]), ["b"]],
  ["hallucinated quote rejected", raw([{ id: "a", covered: true, quote: "a variable is a box in memory" }]), []],
  ["too-short quote rejected", raw([{ id: "a", covered: true, quote: "a name" }]), []],
  ["covered=false ignored", raw([{ id: "a", covered: false, quote: "a name that I stick on a value" }]), []],
  ["unknown id ignored", raw([{ id: "zzz", covered: true, quote: "a name that I stick on a value" }]), []],
  ["garbage -> nothing", "I think they did great!", []],
  ["close paraphrase accepted", raw([{ id: "a", covered: true, quote: "a variable is a name stuck on a value" }]), ["a"]],
  ["jumbled words rejected", raw([{ id: "a", covered: true, quote: "value stick name variable label" }]), []],
];
for (const [name, r, want] of cases) { const got = verifyCoverage(r, rubric, said); if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${name}: got ${JSON.stringify(got)}`); }
console.log(`verifyCoverage OK (${cases.length} cases)`);
if (tryParseReply("no json here") !== null || !tryParseReply('x {"question":"why?","understanding":4} y')) fail("tryParseReply");
console.log("tryParseReply OK");
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: got ${JSON.stringify(a)}`); };
eq(chooseSpeakers("A variable is a function parameter and an operator.", undefined, 1), ["zee"], "jargon, no analogy -> Zee");
eq(chooseSpeakers("It always works and never fails.", undefined, 1), ["kofi"], "absolute claims -> Kofi");
eq(chooseSpeakers("It is like a label on a box.", undefined, 1), ["maya"], "default -> Maya");
eq(chooseSpeakers("It is like a label on a box.", "maya", 1), ["kofi"], "last speaker is rotated out");
eq(chooseSpeakers("hi", undefined, 3).length, 3, "n=3 returns everyone");
console.log("chooseSpeakers OK"); fake.close(); process.exit(0);
