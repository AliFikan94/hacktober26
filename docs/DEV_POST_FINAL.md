# TeachBack: you don't know it until you can teach it back

*Built for a friend learning Python after long days at an electricity distribution company.*

## The friend
My friend works 9 to 5 at an electricity distribution company. He wants to learn Python, but he's stuck in tutorial hell: hours of videos, projects nobody uses, and no way to know whether he really understands what's happening under the hood. After work he's too tired to type, and our schedules never line up for study sessions.

## The idea
I applied to teach on Stanford's Code in Place, and the application had me teach a simulated class of three virtual students who watch your shared screen, listen, and ask questions. It hit me that the fastest way to find out whether you understand something is to explain it to someone else. Most learning platforms go **Theory → Practice → Workshop**. I wanted to add a fourth step: **Teach**.

## What I built
**TeachBack** is a small learning platform in the browser:
- **8 short lessons** with examples from his world (meter readings, feeder voltages, outage priorities).
- **Practice and workshop exercises** where Python runs inside the page.
- **Teach:** he explains the code to three AI students, Maya (always asks *why*), Kofi (always asks *what breaks*) and Zee (needs it in plain words). They see his code and the terminal output, and one chimes in at a time.
- **A separate examiner** that checks whether he explained each key idea in his own words, and must point to words he actually said. Evidence he never said is rejected.
- **A capstone:** his final project is to design his own certificate in Python, with guidance, then teach it back. The app then shows the certificate he built.

[SCREENSHOTS or SHORT RECORDING of what works: the home screen, a lesson, Python running, the capstone, the certificate.]

## Why open-source AI
The students and the examiner are agents built with **Mastra**, running an open-weight model through **Ollama** on the learner's own machine. That matters for a tired adult learner for three reasons: his half-understood code and "dumb questions" can stay on his computer, it costs nothing to run after work every day, and I can change how the students behave by editing prompts. I could not have tuned that in a closed chatbot. The app also tells you honestly what is and isn't private: browser voice recognition in Chrome and Edge sends audio to Google or Microsoft, so typing is the private option.

## The honest part: what didn't work
I'm submitting this incomplete, and I'd rather say so.
- **My own PC was too small.** A 4B Gemma model needs about 4 GB of free memory and I had about 2.5. So I built the app to measure free memory and choose a model that fits, or fall back to a cloud model and say so.
- **Small models don't follow formats.** A tiny model often answers in plain sentences instead of the structure the examiner needs. I added a labelled keyword-check fallback for those cases.
- **Voice is fragile.** The browser's built-in speech recognition ends sessions on its own, needs the internet, and fails in different ways on different browsers. I added a microphone test and plain-English explanations of each failure.
- **I could not get the Teach conversation working end to end on my PC before the deadline**, and I haven't found the cause. It is tested against simulated models and automated browser tests, but I can't claim it works with a real Gemma on my machine. I also never got my friend to test it, so I have no quote from him to share.

## What I learned
Building for one real person on real hardware humbled the design. The hardest part of "open-source AI" wasn't the AI; it was fitting it onto the computer he actually has. If I continue, the first steps are a hosted option for people with small laptops and a real session with my friend.

## Code
https://github.com/AliFikan94/hacktober26/tree/claude/hacktoberfest-weekend-challenge-jsoemc

Built with Mastra and Ollama. Lesson idea inspired by Stanford's Code in Place.
