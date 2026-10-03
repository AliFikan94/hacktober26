# 🎓 TeachBack

**Theory → Practice → Workshop → _Teach_.**
A learn-and-teach platform built for a friend who works 9–5 at an electricity distribution company, wants to learn Python, and is too tired to type after work.

Each lesson has four phases: 📖 **Theory** (short, grid-themed explanation plus curated and DuckDuckGo-searched resources), ✏️ **Practice** and 🛠️ **Workshop** (run Python right in the browser via Pyodide), then 🎓 **Teach**. Instead of another tutorial, he *teaches* three AI students out loud while sharing his code:

| Student | Asks | 
|---|---|
| 🧐 **Maya**, the Curious One | "Why? What happens under the hood?" |
| 🤨 **Kofi**, the Skeptic | "When does this break? What if the meter sends nothing?" |
| 🥺 **Zee**, the Slow Learner | "Can you say that like I'm new?" |

Each student also scores how well your explanation landed (0–10). If you can't make Zee understand, you don't understand it yet.

## Why open source
- **Gemma runs locally via Ollama**: his half-understood code and "dumb questions" never leave his laptop, and it costs nothing to run.
- **Mastra** (open agent framework) orchestrates the three students; swap the model with one env var.
- Because the weights are open, the students' behaviour is fully ours to tune.

## Run it
Non-coders: double-click `start.bat` (Windows) or run `./start.sh` (Mac/Linux). It installs and opens the app.

```bash
ollama pull gemma3:4b        # or any model; set LLM_MODEL
npm install
npm start                    # http://localhost:3000
npm test                     # smoke + search-parser tests, no Ollama needed
```
Use Chrome/Edge/Safari for the hold-to-talk mic. Click "Teach →" or release the mic button to send.

### Optional config (env vars)
| Var | Effect |
|---|---|
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Any OpenAI-compatible endpoint (default `http://localhost:11434/v1`, `gemma3:4b`) |
| `MONGODB_URI` | Persist sessions in MongoDB Atlas (default: local `data/sessions.json`) |
| `EXAMINER_MODEL` | Optional separate model for judging explanations |
| `HOSTED=1` | Public deployment mode: model switching off, rate limits on (see `render.yaml`, untested) |
| `SHARE_URL` | Link included when sharing milestones (default: this repo) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_MAYA/KOFI/ZEE` | ElevenLabs voices (default: browser voices) |

## Experience
Calm, monochrome interface (system fonts, serif for reading). Colour appears only in the three students, shown as softly breathing orbs with a ring that fills as they understand. One clear "Continue" action per step. In the classroom, replies stream in as each student finishes, are spoken aloud, and the conversation is saved per lesson. Tap the mic to talk, tap again to send. Python errors get a plain-English explanation. The header pill shows the AI model and whether it runs on this device or in the cloud, and lets you switch models.

## Low-memory computers
A 4B model needs about 4 GB of free RAM. TeachBack checks each installed model's size against your free memory and automatically uses one that fits (biggest local Gemma first, then any local model, then a cloud model, which it tells you about). On a small PC, pull the tiny Gemma and it will be chosen automatically:
```bash
ollama pull gemma3:1b
```
Small models are weaker at strict JSON and at judging, so run `npm run doctor`. You can use a stronger model only for the examiner with `EXAMINER_MODEL` (note that sends what you say to that model's server if it's a cloud model).

## How "teach it back" is judged
Each lesson has 3 key ideas (`rubric` in `curriculum/python.json`). A separate **examiner** agent checks, after every explanation, which ideas you covered correctly in your own words. It must **quote you word for word**, and the server rejects any quote that is not really in what you said, so the model cannot hallucinate mastery. The students are told which ideas are still missing and steer their questions there. The lesson completes when all ideas are covered. (After 8 explanations an "Finish anyway" escape hatch appears; the certificate then reports how many lessons were examiner-verified.)

## What is private, honestly
| Part | Where it runs |
|---|---|
| AI students + examiner | Your device if you use a local model (e.g. `gemma3:4b`). `:cloud` models and hosted deployments run on a server. |
| Voice input | Browser speech recognition: Chrome/Edge send audio to Google/Microsoft. Typing keeps it local. |
| Python runner | In your browser (Pyodide), but downloaded from a CDN on first use. |
| Web search | DuckDuckGo (needs internet). |
| Progress | Only in your browser. |

## Check your setup
`npm run doctor` tests your real model: valid JSON from the students, response times, and whether the examiner rewards a good explanation and refuses a vague one.

## Progress, certificate and sharing
- **Progress** lives on the home page (steps, streak, explanations) and in each lesson's four tabs. No sidebar, on purpose.
- **Milestones:** finishing a lesson, a module, or the course opens a celebration card with a ready-to-post 1200x630 image and share buttons (native share sheet, X, LinkedIn, WhatsApp, copy text, save image).
- **Certificate:** unlocks at 28/28 steps, uses the learner's name, has a unique ID, and exports as PNG or PDF (print). It is a self-paced completion certificate, not an accredited qualification. Shares link to `SHARE_URL` (default: this repo).
- Everything is stored in the browser (localStorage); no accounts, no tracking.

## Syllabus
`curriculum/python.json`: 3 modules, 7 lessons (variables, numbers, conditionals, functions, loops/lists, dicts, error handling), all using electricity-distribution examples. Add a lesson by adding an object; no code changes needed. Progress is stored in the browser. A lesson's Teach step completes automatically when all three students score 7+/10.

## Notes
- **Web search** uses DuckDuckGo's HTML endpoint (no API key). It's scraping, so it can break or be rate-limited; curated links always show too.
- **Python runner** loads Pyodide from a CDN on first Run (needs internet once).

## Layout
- `src/students.ts`: the three Mastra agents and personalities
- `src/classroom.ts`: parallel fan-out of one teaching turn
- `src/store.ts`: session memory (Mongo or file)
- `src/search.ts`: DuckDuckGo search
- `curriculum/python.json`: the syllabus
- `src/server.ts`, `public/index.html`: server and voice-first UI

## Status / TODO
- [ ] Test with real Gemma on a laptop, and tune prompts
- [ ] Deploy (Render / DigitalOcean) with a hosted open-model endpoint
- [ ] Hand it to the friend, record what he says
- [ ] Atlas Vector Search for cross-session memory of what each student is still confused about
