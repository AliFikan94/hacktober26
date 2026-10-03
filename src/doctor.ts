// `npm run doctor`: checks your real model setup and shows how the students and examiner actually behave.
import { readFile } from "node:fs/promises";
import { classroomTurn, examineTurn, generateJson, tryParseReply, studentPrompt, type RubricPoint } from "./classroom.js";
import { MODEL, agents, STUDENTS, type StudentId } from "./students.js";

const base = process.env.OLLAMA_HOST ?? (process.env.LLM_BASE_URL ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, "");
const ok = (s: string) => console.log("  ✓ " + s), bad = (s: string) => console.log("  ✗ " + s), warn = (s: string) => console.log("  ! " + s);

console.log(`\nTeachBack doctor\nmodel: ${MODEL}\nendpoint: ${base}\n`);
console.log("1. Is the model server reachable?");
try {
  const d = (await (await fetch(base + "/api/tags", { signal: AbortSignal.timeout(4000) })).json()) as { models: { name: string }[] };
  ok(`Ollama is running. Installed: ${d.models.map((m) => m.name).join(", ") || "(none)"}`);
  if (!d.models.some((m) => m.name === MODEL || m.name === MODEL + ":latest")) bad(`"${MODEL}" is not installed. Run: ollama pull ${MODEL}  (or set LLM_MODEL to one of the above)`);
} catch { warn("Couldn't list models (not Ollama, or not running). Continuing anyway."); }
if (/(^|[-:])cloud$/.test(MODEL)) warn("This is a cloud model: it runs on Ollama's servers, not your device. Fine to test, but don't claim 'fully local'.");
if (!/gemma/i.test(MODEL)) warn("Not a Gemma model, so this won't count toward the Gemma category.");

const c = JSON.parse(await readFile("curriculum/python.json", "utf8"));
const lesson = c.modules[0].lessons[0], rubric: RubricPoint[] = lesson.rubric;
const good = "A variable is basically a name that I stick on a value, like a label on a transformer. I create it with the equals sign, so voltage equals 230. Values come in types, like int for whole numbers, float for decimals, str for text and bool for true or false, and type() tells you which one it is.";
const bad2 = "It's just a thing. You write it and it works.";

console.log("\n2. Do the students answer in valid JSON? (one real turn, timed)");
const t0 = Date.now(); let parsedFirstTry = 0;
const prompt = studentPrompt({ topic: lesson.teach.topic, code: lesson.example, history: [], utterance: good, uncovered: rubric });
for (const id of Object.keys(agents) as StudentId[]) {
  const t = Date.now();
  try {
    const { value, attempts } = await generateJson(agents[id], prompt, tryParseReply);
    if (attempts === 1 && value) parsedFirstTry++;
    value ? ok(`${STUDENTS[id].name} (${((Date.now() - t) / 1000).toFixed(1)}s, ${attempts} attempt${attempts > 1 ? "s" : ""}): "${value.question}"  [understanding ${value.understanding}/10]`)
      : bad(`${STUDENTS[id].name}: no valid JSON even after retry`);
  } catch (e) { bad(`${STUDENTS[id].name}: ${(e as Error).message}`); }
}
console.log(`  → ${parsedFirstTry}/3 valid on the first try. Total ${((Date.now() - t0) / 1000).toFixed(1)}s for the three (they run in parallel in the app).`);

console.log("\n3. Does the examiner judge fairly? It must reward a good explanation and refuse a bad one.");
const g = await examineTurn(rubric, good), b = await examineTurn(rubric, bad2);
(g.covered.length >= 2 ? ok : bad)(`Good explanation: covered ${g.covered.length}/${rubric.length} (${g.covered.join(", ") || "none"}). Expected 2 or 3.`);
(b.covered.length === 0 ? ok : bad)(`Vague answer: covered ${b.covered.length}/${rubric.length}. Expected 0.`);

console.log("\nIf everything above is ✓, you're good. If not, tune the prompts in src/students.ts or try a larger model.\n");
process.exit(0);
