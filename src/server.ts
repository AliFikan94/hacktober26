import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { classroomTurn } from "./classroom.js";
import { MODEL, STUDENTS } from "./students.js";
import { loadSession, saveTurn } from "./store.js";
import { ddgSearch } from "./search.js";

const PORT = Number(process.env.PORT ?? 3000);
const VOICES: Record<string, string | undefined> = {
  maya: process.env.ELEVENLABS_VOICE_MAYA, kofi: process.env.ELEVENLABS_VOICE_KOFI, zee: process.env.ELEVENLABS_VOICE_ZEE,
};

async function body(req: IncomingMessage) {
  let s = ""; for await (const c of req) s += c; return s ? JSON.parse(s) : {};
}
function send(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" }); return res.end(await readFile("public/index.html"));
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      return send(res, 200, { model: MODEL, students: STUDENTS, elevenlabs: !!process.env.ELEVENLABS_API_KEY });
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
      const { sessionId, topic, code, utterance } = await body(req);
      if (!sessionId || !utterance?.trim()) return send(res, 400, { error: "sessionId and utterance required" });
      const prior = await loadSession(sessionId);
      const replies = await classroomTurn({ topic: topic ?? "Python", code: code ?? "", history: prior?.history ?? [], utterance });
      const s = await saveTurn(sessionId, topic ?? "Python", code ?? "", utterance, replies);
      return send(res, 200, { replies, understanding: s.understanding });
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
    console.error(e); send(res, 500, { error: String((e as Error).message ?? e) });
  }
}).listen(PORT, () => console.log(`TeachBack on http://localhost:${PORT} (model: ${MODEL})`));
