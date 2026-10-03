import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { classroomTurn } from "./classroom.js";
import { MODEL, STUDENTS, agents, setModel } from "./students.js";
import { loadSession, saveTurn } from "./store.js";
import { ddgSearch } from "./search.js";

const PORT = Number(process.env.PORT ?? 3000);
const OLLAMA = (process.env.OLLAMA_HOST ?? (process.env.LLM_BASE_URL ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, ""));
const VOICES: Record<string, string | undefined> = {
  maya: process.env.ELEVENLABS_VOICE_MAYA, kofi: process.env.ELEVENLABS_VOICE_KOFI, zee: process.env.ELEVENLABS_VOICE_ZEE,
};
const TYPES: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

// Model warm-up: the first request to a local model can take a long time, so do it before the student needs it.
let ready = false, modelError = "", warming = false, epoch = 0;
async function warm() {
  if (warming) return;
  warming = true; const mine = epoch;
  try { await agents.maya.generate("Reply with the single word: OK"); if (mine === epoch) { ready = true; modelError = ""; } }
  catch (e) { if (mine === epoch) { ready = false; modelError = String((e as Error).message ?? e); } }
  finally { warming = false; }
}
void warm(); setInterval(() => { if (!ready) void warm(); }, 5000).unref();

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
      return send(res, 200, { model: MODEL, ready, modelError, students: STUDENTS, elevenlabs: !!process.env.ELEVENLABS_API_KEY });
    }
    if (req.method === "GET" && url.pathname === "/api/models") {
      try {
        const r = await fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(3000) });
        const d = (await r.json()) as { models?: { name: string }[] };
        return send(res, 200, { current: MODEL, installed: (d.models ?? []).map((m) => ({ name: m.name, cloud: /(^|[-:])cloud$/.test(m.name) })) });
      } catch { return send(res, 200, { current: MODEL, installed: [], unreachable: true }); }
    }
    if (req.method === "POST" && url.pathname === "/api/model") {
      const { model } = await body(req);
      if (typeof model !== "string" || !model.trim()) return send(res, 400, { error: "model required" });
      if (model !== MODEL) { setModel(model); epoch++; ready = false; modelError = ""; warming = false; void warm(); }
      return send(res, 200, { model: MODEL });
    }
    if (req.method === "GET" && url.pathname === "/api/curriculum") {
      res.writeHead(200, { "content-type": "application/json" }); return res.end(await readFile("curriculum/python.json"));
    }
    if (req.method === "GET" && url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
      if (!q) return send(res, 400, { error: "q required" });
      try { return send(res, 200, { hits: await ddgSearch(q) }); }
      catch (e) { return send(res, 502, { error: "Search unavailable: " + (e as Error).message }); }
    }
    if (req.method === "POST" && url.pathname === "/api/turn") {
      // Streams one JSON line per student as soon as each finishes, then a final "done" line.
      const { sessionId, topic, code, utterance } = await body(req);
      if (!sessionId || !utterance?.trim()) return send(res, 400, { error: "sessionId and utterance required" });
      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" }); res.flushHeaders();
      const line = (o: unknown) => res.write(JSON.stringify(o) + "\n");
      const prior = await loadSession(sessionId);
      let firstError = "";
      const replies = await classroomTurn({ topic: topic ?? "Python", code: code ?? "", history: prior?.history ?? [], utterance },
        (e) => { if (e.type === "error") firstError ||= e.message; line(e); });
      if (!replies.length) { line({ type: "fatal", message: firstError || "No reply from the model." }); return res.end(); }
      const s = await saveTurn(sessionId, topic ?? "Python", code ?? "", utterance, replies);
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
