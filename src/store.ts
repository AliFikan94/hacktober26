import { mkdir, readFile, writeFile } from "node:fs/promises";
import { MongoClient, type Collection } from "mongodb";
import type { Reply, Turn } from "./classroom.js";

export type Session = { _id: string; topic: string; code: string; history: Turn[]; understanding: Record<string, number[]>; covered: string[]; updatedAt: string };

// MongoDB Atlas when MONGODB_URI is set, otherwise a local JSON file (keeps the offline story intact).
let col: Collection<Session> | null = null;
if (process.env.MONGODB_URI) {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  col = client.db(process.env.MONGODB_DB ?? "reverse_classroom").collection<Session>("sessions");
}
const FILE = "data/sessions.json";

async function readAll(): Promise<Record<string, Session>> {
  try { return JSON.parse(await readFile(FILE, "utf8")); } catch { return {}; }
}

export async function loadSession(id: string): Promise<Session | null> {
  if (col) return col.findOne({ _id: id });
  return (await readAll())[id] ?? null;
}

export async function saveTurn(id: string, topic: string, code: string, utterance: string, replies: Reply[], covered: string[] = []) {
  const s: Session = (await loadSession(id)) ?? { _id: id, topic, code, history: [], understanding: {}, covered: [], updatedAt: "" };
  s.covered ??= [];
  s.covered = [...new Set([...s.covered, ...covered])];
  s.topic = topic; s.code = code; s.updatedAt = new Date().toISOString();
  s.history.push({ who: "teacher", text: utterance });
  for (const r of replies) {
    s.history.push({ who: r.id, text: r.question });
    (s.understanding[r.id] ??= []).push(r.understanding);
  }
  if (col) await col.replaceOne({ _id: id }, s, { upsert: true });
  else {
    const all = await readAll(); all[id] = s;
    await mkdir("data", { recursive: true });
    await writeFile(FILE, JSON.stringify(all, null, 2));
  }
  return s;
}
