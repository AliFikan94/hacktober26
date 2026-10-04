import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { classroomTurn, examineTurn, chooseSpeakers, generateJson, tryParseReply, studentPrompt, type RubricPoint } from "./classroom.js";
import { MODEL, STUDENTS, agents, setModel, type StudentId } from "./students.js";
import { loadSession, saveTurn } from "./store.js";
import { ddgSearch } from "./search.js";
import { OLLAMA, installedModels, autoSelect, isCloudName, names, friendlyModelError } from "./models.js";

console.log("Starting TeachBack…");
process.on("exit", (c) => console.log(`TeachBack stopped (code ${c}).`));
process.on("unhandledRejection", (e) => console.error("Unexpected error:", (e as Error)?.message ?? e));
const PORT = Number(process.env.PORT ?? 3000);
const VOICES: Record<string, string | undefined> = {
  maya: process.env.ELEVENLABS_VOICE_MAYA, kofi: process.env.ELEVENLABS_VOICE_KOFI, zee: process.env.ELEVENLABS_VOICE_ZEE,
};
const HOSTED = process.env.HOSTED === "1"; // public deployment: no model switching, rate limits on
const rubrics = new Map<string, RubricPoint[]>();
{
  const c = JSON.parse(await readFile("curriculum/python.json", "utf8"));
  for (const m of c.modules) for (const l of m.lessons) rubrics.set(l.id, l.rubric ?? []);
}
const hitLog = new Map<string, number[]>();
function limited(req: IncomingMessage, key: string, max: number) {
  if (!HOSTED) return false;
  const k = key + ":" + (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress), now = Date.now();
  const arr = (hitLog.get(k) ?? []).filter((t) => now - t < 60_000);
  arr.push(now); hitLog.set(k, arr); return arr.length > max;
}
const TYPES: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

// Model warm-up: the first request to a local model can take a long time, so do it before the student needs it.
// If the default model isn't installed, quietly pick a sensible installed one (unless LLM_MODEL was set on purpose).
let ready = false, modelError = "", warming = false, epoch = 0, userPicked = false, nextTry = 0, backoff = 5000;
async function warm() {
  if (warming) return;
  warming = true; const mine = epoch;
  try {
    const list = await installedModels(), old = MODEL, sel = autoSelect(list, userPicked);
    if (sel.switchedTo) console.log(`Model "${old}" ${sel.reason === "memory" ? "needs more memory than this computer has free" : "isn't installed"}, so using "${sel.switchedTo}"${isCloudName(sel.switchedTo) ? " (a cloud model: it runs on Ollama's servers)" : ""}. For a private local model on a small PC run: ollama pull gemma3:1b`);
    if (sel.missing) { modelError = `"${MODEL}" isn't installed. Installed: ${list ? names(list).join(", ") || "nothing" : "(can't reach Ollama)"}.`; ready = false; nextTry = Date.now() + (backoff = Math.min(backoff * 2, 30000)); return; }
    await agents.maya.generate("Reply with the single word: OK");
    if (mine === epoch) { ready = true; modelError = ""; backoff = 5000; }
  } catch (e) {
    if (mine === epoch) { ready = false; modelError = friendlyModelError(String((e as Error).message ?? e)); nextTry = Date.now() + (backoff = Math.min(backoff * 2, 30000)); }
  } finally { warming = false; }
}
void warm(); setInterval(() => { if (!ready && Date.now() >= nextTry) void warm(); }, 2000).unref();

async function body(req: IncomingMessage) {
  let s = ""; for await (const c of req) s += c; return s ? JSON.parse(s) : {};
}
function send(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      const rel = url.pathname === "/" ? "index.html" : normalize(url.pathname).replace(/^([/\\])+/, "");
      if (rel.startsWith("..") || !TYPES[extname(rel)]) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": TYPES[extname(rel)] + "; charset=utf-8", "cache-control": "no-cache" });
      return res.end(await readFile(join("public", rel)));
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      return send(res, 200, { model: MODEL, ready, modelError, students: STUDENTS, elevenlabs: !!process.env.ELEVENLABS_API_KEY, hosted: HOSTED, shareUrl: process.env.SHARE_URL ?? "https://github.com/alifikan94/hacktober26" });
    }
    if (req.method === "GET" && url.pathname === "/api/models") {
      try {
        const r = await fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(3000) });
        const d = (await r.json()) as { models?: { name: string }[] };
        return send(res, 200, { current: MODEL, installed: (d.models ?? []).map((m) => ({ name: m.name, cloud: /(^|[-:])cloud$/.test(m.name) })) });
      } catch { return send(res, 200, { current: MODEL, installed: [], unreachable: true }); }
    }
    if (req.method === "POST" && url.pathname === "/api/model") {
      if (HOSTED) return send(res, 403, { error: "The model is set by the host." });
      const { model } = await body(req);
      if (typeof model !== "string" || !model.trim()) return send(res, 400, { error: "model required" });
      if (model !== MODEL) { userPicked = true; setModel(model); epoch++; ready = false; modelError = ""; warming = false; backoff = 5000; nextTry = 0; void warm(); }
      return send(res, 200, { model: MODEL });
    }
    if (req.method === "GET" && url.pathname === "/api/selftest") {
      // One real student turn and one real examiner call, with plain-English results, so a failure can be pinpointed.
      if (limited(req, "selftest", 3)) return send(res, 429, { error: "Too many tests. Try again in a minute." });
      const out: Record<string, unknown> = { model: MODEL, ready, modelError };
      const rubric = rubrics.get("variables") ?? [];
      const good = "A variable is basically a name that I stick on a value, like a label on a transformer. I create it with the equals sign. Values come in types like int, float, str and bool.";
      let t = Date.now();
      try {
        const r = await generateJson(agents.maya, studentPrompt({ topic: "Variables", code: 'voltage = 230\nprint(voltage)', history: [], utterance: good, output: "230", uncovered: rubric }), tryParseReply);
        out.student = { ok: r.value !== null, attempts: r.attempts, seconds: +((Date.now() - t) / 1000).toFixed(1), said: r.value?.question ?? null, raw: r.value ? undefined : r.raw.slice(0, 300) };
      } catch (e) { out.student = { ok: false, error: friendlyModelError(String((e as Error).message ?? e)) }; }
      t = Date.now();
      try {
        const ex = await examineTurn(rubric, good);
        out.examiner = { ok: true, covered: ex.covered.length, of: rubric.length, attempts: ex.attempts, seconds: +((Date.now() - t) / 1000).toFixed(1) };
      } catch (e) { out.examiner = { ok: false, error: friendlyModelError(String((e as Error).message ?? e)) }; }
      return send(res, 200, out);
    }
    if (req.method === "GET" && url.pathname === "/api/curriculum") {
      res.writeHead(200, { "content-type": "application/json" }); return res.end(await readFile("curriculum/python.json"));
    }
    if (req.method === "GET" && url.pathname === "/api/search") {
      if (limited(req, "search", 20)) return send(res, 429, { error: "Too many searches. Try again in a minute." });
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
      if (!q) return send(res, 400, { error: "q required" });
      try { return send(res, 200, { hits: await ddgSearch(q) }); }
      catch (e) { return send(res, 502, { error: "Search unavailable: " + (e as Error).message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/turn") {
      // Streams one JSON line per student as it finishes, then "coverage" (examiner) and "done".
      if (limited(req, "turn", 20)) return send(res, 429, { error: "Slow down a little. Too many requests this minute." });
      const { sessionId, lessonId, topic, code, utterance, output } = await body(req);
      if (!sessionId || !utterance?.trim()) return send(res, 400, { error: "sessionId and utterance required" });
      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" }); res.flushHeaders();
      const line = (o: unknown) => res.write(JSON.stringify(o) + "\n");
      const prior = await loadSession(sessionId);
      const rubric = rubrics.get(lessonId) ?? [], already = new Set(prior?.covered ?? []);
      const teacherText = [...(prior?.history ?? []).filter((t) => t.who === "teacher").map((t) => t.text), utterance].join("\n");
      let firstError = "";
      const lastSpeaker = [...(prior?.history ?? [])].reverse().find((t) => t.who !== "teacher")?.who as StudentId | undefined;
      const speakers = chooseSpeakers(utterance, lastSpeaker, Number(process.env.STUDENTS_PER_TURN ?? 1));
      line({ type: "speakers", ids: speakers });
      const longEnough = utterance.trim().split(/\s+/).length >= 6;
      const exam = rubric.length && longEnough ? examineTurn(rubric, teacherText).catch(() => ({ covered: [] as string[], attempts: 0, degraded: false })) : Promise.resolve({ covered: [] as string[], attempts: 0, degraded: false });
      const replies = await classroomTurn({ topic: topic ?? "Python", code: code ?? "", history: prior?.history ?? [], utterance, output: typeof output === "string" ? output : "", speakers, uncovered: rubric.filter((r) => !already.has(r.id)) },
        (e) => { if (e.type === "error") firstError ||= e.message; line(e); });
      if (!replies.length) { line({ type: "fatal", message: firstError || "No reply from the model." }); return res.end(); }
      const { covered, degraded } = await exam, all = [...new Set([...already, ...covered])];
      const s = await saveTurn(sessionId, topic ?? "Python", code ?? "", utterance, replies, all);
      line({ type: "coverage", covered: s.covered, total: rubric.length, degraded: !!degraded });
      line({ type: "done", understanding: s.understanding }); return res.end();
    }
    if (req.method === "GET" && url.pathname === "/api/report") {
      const s = await loadSession(url.searchParams.get("sessionId") ?? "");
      return send(res, s ? 200 : 404, s ?? { error: "no such session" });
    }
    if (req.method === "POST" && url.pathname === "/api/tts") {
      const key = process.env.ELEVENLABS_API_KEY;
      const { student, text } = await body(req);
      if (!key || !VOICES[student]) return send(res, 501, { error: "ElevenLabs not configured; client falls back to browser voices" });
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[student]}`, {
        method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
      });
      if (!r.ok) return send(res, 502, { error: "ElevenLabs error " + r.status });
      res.writeHead(200, { "content-type": "audio/mpeg" }); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e); if (!res.headersSent) send(res, 500, { error: String((e as Error).message ?? e) }); else res.end();
  }
}).listen(PORT, () => console.log(`TeachBack on http://localhost:${PORT} (model: ${MODEL})`));
