import { pickModel, autoSelect, fits } from "./models.js";
import { MODEL } from "./students.js";
const GB = 1e9, fail = (m: string) => { console.error("FAIL: " + m); process.exit(1); };
const g4 = { name: "gemma3:4b", size: 3.3 * GB }, g1 = { name: "gemma3:1b", size: 0.815 * GB };
const glm = { name: "glm-5:cloud", size: 0 }, qwen = { name: "qwen3-coder:480b-cloud", size: 0 }, emb = { name: "nomic-embed-text", size: 0.27 * GB };
const cases: [string, ReturnType<typeof pickModel>, string][] = [
  ["your PC: 4b too big, only cloud fits", pickModel([g4, glm, qwen], 2.5 * GB), "glm-5:cloud"],
  ["after pulling 1b: local beats cloud", pickModel([g4, g1, glm, qwen], 2.5 * GB), "gemma3:1b"],
  ["plenty of memory: biggest Gemma", pickModel([g4, g1, glm], 8 * GB), "gemma3:4b"],
  ["nothing fits, no cloud: smallest local", pickModel([g4], 2.5 * GB), "gemma3:4b"],
  ["embedding models never chosen", pickModel([emb, glm], 2.5 * GB), "glm-5:cloud"],
];
for (const [n, got, want] of cases) if (got !== want) fail(`${n}: got ${got}, want ${want}`);
if (fits(g4, 2.5 * GB) || !fits(g1, 2.5 * GB) || !fits(glm, 0)) fail("fits()");
if (MODEL !== "gemma3:4b") fail("default model should be gemma3:4b, got " + MODEL);
process.env.TB_FREE_BYTES = String(2.5 * GB);
const s = autoSelect([g4, glm, qwen]);
if (s.switchedTo !== "glm-5:cloud" || s.reason !== "memory") fail("autoSelect memory: " + JSON.stringify(s));
console.log(`models OK (${cases.length + 2} checks)`); process.exit(0);
