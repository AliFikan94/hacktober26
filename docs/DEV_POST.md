# DRAFT: paste into DEV's official submission template. Fill every [BRACKET] with something TRUE.

*Delete this line. Do not claim anything below that you did not actually see working.*

---

**Title ideas:**
- "My friend works at the power company and is too tired to type. So I built him a classroom that listens."
- "Tutorial hell ends when you have to explain it to three stubborn AI students"

## The friend
[Name or nickname] works 9 to 5 at an electricity distribution company. He wants to learn Python. He keeps falling into tutorial hell: watching videos, building things, never being sure he understands what's under the hood. After work he's too tired to type, and we never manage to find time to study together.

## The idea (and where it came from)
I applied to teach on Stanford's Code in Place, and the application had me teach a simulated class of three virtual students who watch your shared screen, listen to your explanation and ask questions. It hit me: the fastest way to know whether you understand something is to explain it. So I built the same idea for one person, with open models.

Most platforms go **Theory → Practice → Workshop.** TeachBack adds a fourth step: **Teach.**

## What I built: TeachBack
- Short lessons with examples from his world: meter readings, feeder voltages, outage priorities. [N lessons]
- Practice and workshop exercises that run Python right in the browser.
- **Teach:** he explains the code out loud to three students: Maya (always asks *why*), Kofi (always asks *what breaks*, using meter data), and Zee (needs it in plain words). They see his code and what the terminal printed. One chimes in at a time.
- A separate examiner checks whether he explained each key idea correctly **in his own words**. It must point to his actual words as evidence; the server rejects evidence he never said.
- A capstone: his final project is to **design his own certificate in Python**, with guidance, then teach it back. The app then shows the certificate he built. [Only keep this if you tested it]

[SCREENSHOT or SHORT SCREEN RECORDING of a real Teach session. Required.]

## Why open-source AI was the point
- **Open-weight model on my own machine.** The students run on Gemma ([which size, e.g. gemma3:1b]) through Ollama, orchestrated with Mastra. [Say plainly what ran in your demo: local or cloud.]
- **Control.** The three personalities, the examiner, the rule that students never give answers: all of it is prompts I could change in minutes. I could not have tuned that behaviour in a closed chatbot.
- **Privacy, honestly.** The AI part can run entirely on his computer. But browser voice recognition in Chrome/Edge sends audio to Google/Microsoft, so typing is the private path. The app has a panel that says exactly what stays on-device.
- **Small computers are real.** My own PC didn't have the memory for a 4B model, so the app measures free memory and picks a model that fits. [Your real experience here.]

## What worked, and what didn't (be honest, judges respect it)
- [What really worked when you tried it]
- [What was weak: e.g. a 1B model is weak at strict formats and at judging, so the app falls back to a labelled keyword check]
- Not done: [e.g. hosted version, MongoDB memory, fully offline voice]

## The hand-over
[ONLY if it happened: what he said, with his permission. Real quotes, not invented.]

## How it works
Browser speech-to-text → text + his code + terminal output → server → a rule picks which student speaks → one Mastra agent on the open model replies → browser text-to-speech. In parallel, an examiner agent checks which key ideas he covered.
Repo: https://github.com/alifikan94/hacktober26 (branch `claude/hacktoberfest-weekend-challenge-jsoemc`)

## Categories
Gemma, Mastra. [Only list what you genuinely used. Do not list MongoDB, ElevenLabs, Render, etc. unless it actually runs.]
