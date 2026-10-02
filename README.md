# 🎓 Reverse Classroom

**Theory → Practice → Workshop → _Teach_.**
Built for a friend who works 9–5 at an electricity distribution company, wants to learn Python, and is too tired to type after work.

Instead of another tutorial, he *teaches* three AI students out loud while sharing his code:

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
```bash
ollama pull gemma2:9b        # or any model; set LLM_MODEL
npm install
npm start                    # http://localhost:3000
npm test                     # smoke test with a fake LLM, no Ollama needed
```
Use Chrome/Edge/Safari for the hold-to-talk mic. Click "Teach →" or release the mic button to send.

### Optional config (env vars)
| Var | Effect |
|---|---|
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Any OpenAI-compatible endpoint (default `http://localhost:11434/v1`, `gemma2:9b`) |
| `MONGODB_URI` | Persist sessions in MongoDB Atlas (default: local `data/sessions.json`) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_MAYA/KOFI/ZEE` | ElevenLabs voices (default: browser voices) |

## Layout
- `src/students.ts`: the three Mastra agents and personalities
- `src/classroom.ts`: parallel fan-out of one teaching turn
- `src/store.ts`: session memory (Mongo or file)
- `src/server.ts`, `public/index.html`: server and voice-first UI

## Status / TODO
- [ ] Test with real Gemma on a laptop, and tune prompts
- [ ] Deploy (Render / DigitalOcean) with a hosted open-model endpoint
- [ ] Hand it to the friend, record what he says
- [ ] Atlas Vector Search for cross-session memory of what each student is still confused about
