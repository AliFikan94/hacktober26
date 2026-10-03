"use strict";
/* TeachBack front end: home, lesson (theory/practice/workshop) and the classroom. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>'),
  send: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  speaker: svg('<path d="M4 9v6h4l5 4V5L8 9H4zM17 9a4 4 0 0 1 0 6"/>'),
  muted: svg('<path d="M4 9v6h4l5 4V5L8 9H4zM17 9l4 6M21 9l-4 6"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>', 'class="chev"'),
  play: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>', 'width="12" height="12"'),
};
const PHASES = ["theory", "practice", "workshop", "teach"];
const PHASE_LABEL = { theory: "Theory", practice: "Practice", workshop: "Workshop", teach: "Teach" };
const isCloud = (m) => /(^|[-:])cloud$/.test(m);

let cfg, course, lessons = [], cleanup = () => {}, renderedLesson = null, pollTimer = null;
let progress = store.get("tb-progress", {});
let muted = store.get("tb-muted", false);
const baseSession = store.get("tb-session", null) || (crypto.randomUUID?.() ?? String(Date.now()));
store.set("tb-session", baseSession);

const isDone = (lid, p) => !!progress[lid]?.[p];
function markDone(lid, p) { (progress[lid] ??= {})[p] = true; store.set("tb-progress", progress); updateRing(); }
const stepsDone = () => lessons.reduce((n, l) => n + PHASES.filter((p) => isDone(l.id, p)).length, 0);
function nextTarget() { for (const l of lessons) for (const p of PHASES) if (!isDone(l.id, p)) return { l, p }; return null; }
function updateRing() { const f = stepsDone() / (lessons.length * 4 || 1); $("ring").style.strokeDashoffset = 75.4 * (1 - f); }

/* ================= model status + picker ================= */
function updatePill() {
  const state = cfg.modelError ? "bad" : cfg.ready ? "ok" : "warm";
  $("dot").className = "dot " + (state === "bad" ? "bad" : state === "ok" ? "ok" : "warm");
  $("pillname").textContent = cfg.model;
  $("pill").title = state === "ok" ? (isCloud(cfg.model) ? "Ready · runs in the cloud, not on this device" : "Ready · runs on this device")
    : state === "bad" ? "This model isn't available. Click to choose another." : "Warming up the students…";
  $("banner").innerHTML = cfg.modelError
    ? `<div class="banner"><span><b>${esc(cfg.model)}</b> isn't available on this computer.</span><button class="btn sm" id="pick">Choose a model</button></div>` : "";
  if ($("pick")) $("pick").onclick = openPop;
}
async function loadConfig() { cfg = await fetch("/api/config").then((r) => r.json()); updatePill(); return cfg; }
function startPoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => { await loadConfig().catch(() => {}); if (cfg?.ready) clearInterval(pollTimer); }, 2500);
}
async function openPop() {
  const pop = $("pop"); pop.classList.remove("hidden"); pop.innerHTML = `<p>Looking for models…</p>`;
  const d = await fetch("/api/models").then((r) => r.json()).catch(() => ({ installed: [], unreachable: true }));
  const rows = d.installed.map((m) => `<button class="opt ${m.name === cfg.model ? "on" : ""}" data-m="${esc(m.name)}" role="menuitemradio">
      <span><div class="name">${esc(m.name)}</div><div class="sub">${m.cloud ? "Runs on Ollama's servers" : "Runs on this device"}</div></span>${svg('<path d="M5 12l5 5 9-10"/>', 'class="check"')}</button>`).join("");
  pop.innerHTML = `<h4>AI model</h4>${rows || `<p>${d.unreachable ? "Can't reach Ollama. Open the Ollama app, then try again." : "No models installed yet. In a terminal run <code>ollama pull gemma3:4b</code>."}</p>`}
    ${d.installed.some((m) => /gemma/i.test(m.name)) ? "" : `<p>Tip: a local Gemma model keeps everything on this device.</p>`}`;
  pop.querySelectorAll(".opt").forEach((b) => (b.onclick = async () => {
    await fetch("/api/model", { method: "POST", body: JSON.stringify({ model: b.dataset.m }) });
    store.set("tb-model", b.dataset.m); pop.classList.add("hidden"); await loadConfig(); startPoll();
  }));
}
$("pill").onclick = (e) => { e.stopPropagation(); $("pop").classList.contains("hidden") ? openPop() : $("pop").classList.add("hidden"); };
document.addEventListener("click", (e) => { if (!e.target.closest("#pop")) $("pop").classList.add("hidden"); });
addEventListener("keydown", (e) => e.key === "Escape" && $("pop").classList.add("hidden"));
addEventListener("scroll", () => $("bar").classList.toggle("scrolled", scrollY > 8), { passive: true });

/* ================= router ================= */
async function init() {
  [cfg, course] = await Promise.all([fetch("/api/config").then((r) => r.json()), fetch("/api/curriculum").then((r) => r.json())]);
  const saved = store.get("tb-model", null);
  if (saved && saved !== cfg.model) { await fetch("/api/model", { method: "POST", body: JSON.stringify({ model: saved }) }); await loadConfig(); }
  lessons = course.modules.flatMap((m) => m.lessons);
  updatePill(); updateRing(); if (!cfg.ready) startPoll();
  addEventListener("hashchange", route); route();
}
function route() {
  cleanup(); cleanup = () => {};
  const [, area, id, ph] = location.hash.split("/");
  const l = area === "lesson" && lessons.find((x) => x.id === id);
  if (l) lessonPage(l, PHASES.includes(ph) ? ph : (PHASES.find((p) => !isDone(l.id, p)) ?? "theory"));
  else { renderedLesson = null; homePage(); }
}
const go = (hash) => { location.hash = hash; };

/* ================= home ================= */
function homePage() {
  const t = nextTarget(), done = stepsDone(), total = lessons.length * 4, hr = new Date().getHours();
  const started = done > 0;
  $("view").innerHTML = `<div class="page">
    <p class="eyebrow">${esc(course.title)}</p>
    <h1 class="display">Learn it.<br><em>Then teach it back.</em></h1>
    <p class="lede">Read a short lesson, write a little code, then explain it out loud to three curious students. If you can make them understand, you really understand it.</p>
    ${t ? `<div class="continue"><div><small>${started ? (hr < 12 ? "Good morning · pick up where you left off" : "Pick up where you left off") : "Start here"}</small><strong>${esc(t.l.title)} · ${PHASE_LABEL[t.p]}</strong></div>
      <button class="btn" id="cont">${started ? "Continue" : "Begin"}</button></div>`
      : `<div class="continue"><div><small>All done</small><strong>You finished the whole course.</strong></div></div>`}
    <div class="overall"><div class="track"><i style="width:${(done / total) * 100}%"></i></div><span>${done} of ${total} steps</span></div>
    ${course.modules.map((m) => `<h3 class="group-title">${esc(m.title)}</h3><div class="group">${m.lessons.map((l) => {
      const n = lessons.indexOf(l) + 1, all = PHASES.every((p) => isDone(l.id, p));
      return `<a class="item ${all ? "done" : ""}" href="#/lesson/${l.id}"><span class="num">${all ? "✓" : n}</span><span class="t">${esc(l.title)}</span>
        <span class="pips">${PHASES.map((p) => `<i class="${isDone(l.id, p) ? "on" : ""}"></i>`).join("")}</span>${ICON.chev}</a>`;
    }).join("")}</div>`).join("")}
  </div>`;
  if (t) $("cont").onclick = () => go(`#/lesson/${t.l.id}/${t.p}`);
  scrollTo(0, 0);
}

/* ================= lesson shell ================= */
function lessonPage(l, phase) {
  const idx = lessons.indexOf(l), mod = course.modules.find((m) => m.lessons.includes(l));
  if (renderedLesson !== l.id) {
    $("view").innerHTML = `<div class="page" id="page"><a class="back" href="#/">${svg('<path d="M15 6l-6 6 6 6"/>', 'width="16" height="16"')} Course</a>
      <p class="eyebrow">${esc(mod.title)} · Lesson ${idx + 1} of ${lessons.length}</p><h1 class="title">${esc(l.title)}</h1>
      <div class="seg" id="seg"></div><div id="stage"></div></div>`;
    renderedLesson = l.id;
  }
  $("page").classList.toggle("wide", phase === "teach");
  $("seg").innerHTML = PHASES.map((p) => `<button class="${p === phase ? "active" : ""} ${isDone(l.id, p) ? "done" : ""}" data-p="${p}">${PHASE_LABEL[p]}</button>`).join("");
  $("seg").querySelectorAll("button").forEach((b) => (b.onclick = () => go(`#/lesson/${l.id}/${b.dataset.p}`)));
  const stage = $("stage"); stage.innerHTML = ""; stage.style.animation = "none"; void stage.offsetWidth; stage.style.animation = "rise .4s var(--ease) both";
  const next = (p) => { markDone(l.id, p); const n = PHASES[PHASES.indexOf(p) + 1]; go(`#/lesson/${l.id}/${n}`); };
  if (phase === "theory") viewTheory(l, stage, next);
  else if (phase === "teach") viewTeach(l, stage);
  else viewEditor(l, phase, stage, next);
  if (phase !== "teach") scrollTo({ top: 0 });
}

/* ================= theory ================= */
function viewTheory(l, stage, next) {
  stage.innerHTML = `<div class="prose">${l.theory}</div>
    <h3 class="sec">Example</h3>
    <div class="code-card"><div class="code-head"><span>example.py</span><span class="acts"><button class="chipbtn go" id="tryit">${ICON.play} Try it</button></span></div><pre class="ex">${esc(l.example)}</pre></div>
    <h3 class="sec">Go deeper</h3>
    <div class="list">${l.links.map((k) => `<a class="item" href="${esc(k.url)}" target="_blank" rel="noopener"><span class="t">${esc(k.title)}</span>${ICON.chev}</a>`).join("")}</div>
    <form class="search" id="sf"><input id="q" value="${esc(l.search)}" aria-label="Search the web"><button class="btn soft" type="submit">Search</button></form>
    <div id="hits"></div><p class="note">Web search by DuckDuckGo. Nothing is tracked.</p>
    <div class="foot"><button class="btn" id="next">Continue to Practice</button></div>`;
  $("next").onclick = () => next("theory");
  $("tryit").onclick = () => { store.set(`tb-code-${l.id}-practice`, l.example); markDone(l.id, "theory"); go(`#/lesson/${l.id}/practice`); };
  $("sf").onsubmit = async (e) => {
    e.preventDefault(); $("hits").innerHTML = `<p class="note">Searching…</p>`;
    try {
      const r = await fetch("/api/search?q=" + encodeURIComponent($("q").value)); const d = await r.json(); if (!r.ok) throw new Error(d.error);
      $("hits").innerHTML = d.hits.length ? `<div class="list">${d.hits.map((h) => `<a class="item" href="${esc(h.url)}" target="_blank" rel="noopener"><span style="flex:1;min-width:0"><div class="t">${esc(h.title)}</div><div class="s">${esc(h.snippet)}</div></span>${ICON.chev}</a>`).join("")}</div>` : `<p class="note">No results. Try different words.</p>`;
    } catch (err) { $("hits").innerHTML = `<p class="note">${esc(err.message)} The links above still work.</p>`; }
  };
}

/* ================= code editor ================= */
function createEditor({ value, auto, onChange, onRun }) {
  const el = document.createElement("div"); el.className = "editor";
  el.innerHTML = `<div class="gutter" aria-hidden="true"></div><textarea class="ta" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="Code"></textarea>`;
  const g = el.firstChild, ta = el.lastChild; ta.value = value;
  const sync = () => {
    const n = ta.value.split("\n").length; g.textContent = Array.from({ length: Math.max(n, 1) }, (_, i) => i + 1).join("\n");
    if (auto) ta.style.height = Math.min(Math.max(n, 8), 26) * 22 + 28 + "px";
    g.scrollTop = ta.scrollTop;
  };
  ta.oninput = () => { sync(); onChange?.(ta.value); };
  ta.onscroll = () => (g.scrollTop = ta.scrollTop);
  const insert = (t) => { if (!document.execCommand("insertText", false, t)) { ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, "end"); ta.oninput(); } };
  ta.onkeydown = (e) => {
    if (e.key === "Tab") { e.preventDefault(); insert("    "); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun?.(); }
    else if (e.key === "Enter" && !e.shiftKey) {
      const before = ta.value.slice(0, ta.selectionStart), line = before.slice(before.lastIndexOf("\n") + 1);
      const indent = line.match(/^ */)[0] + (/:\s*$/.test(line) ? "    " : "");
      if (indent) { e.preventDefault(); insert("\n" + indent); }
    }
  };
  sync();
  return { el, get: () => ta.value, set: (v) => { ta.value = v; sync(); onChange?.(v); }, focus: () => ta.focus() };
}

/* ================= python runner ================= */
let pyPromise, pyWarm = false;
function getPython() {
  return (pyPromise ??= new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    s.onload = () => loadPyodide().then((p) => { pyWarm = true; ok(p); }, fail);
    s.onerror = () => fail(new Error("Couldn't load Python. You need to be online the first time."));
    document.head.appendChild(s);
  }).catch((e) => { pyPromise = null; throw e; }));
}
const HELP = [
  [/NameError: name '(.+?)' is not defined/, (m) => `Python doesn't know the name <code>${esc(m[1])}</code> yet. Check the spelling, and make sure you created it on an earlier line.`],
  [/IndentationError/, () => "Python cares about spaces at the start of a line. Lines inside an <code>if</code>, <code>for</code> or <code>def</code> need to be pushed in by 4 spaces."],
  [/SyntaxError/, () => "Python couldn't read this line. Look for a missing quote, bracket or colon <code>:</code>, or a stray character."],
  [/ZeroDivisionError/, () => "Something was divided by zero. Check whether a list or number is empty or zero before dividing."],
  [/TypeError/, () => "Two kinds of values were mixed that don't fit together, like text and a number. Try <code>int()</code>, <code>float()</code> or <code>str()</code> to convert."],
  [/ValueError/, () => "A value was the right kind but couldn't be used, like <code>float('abc')</code>."],
  [/IndexError/, () => "You asked for a position that isn't in the list. Remember, counting starts at 0."],
  [/KeyError/, () => "That key isn't in the dictionary. <code>.get()</code> is a safe way to look things up."],
  [/AttributeError/, () => "That kind of value doesn't have that action. Check the spelling after the dot."],
];
async function runPython(code) {
  const py = await getPython(); let out = "";
  py.setStdout({ batched: (s) => (out += s + "\n") }); py.setStderr({ batched: (s) => (out += s + "\n") });
  try { await py.runPythonAsync(code); return { out }; }
  catch (e) { return { out, error: String(e.message).trim() }; }
}

function viewEditor(l, kind, stage, next) {
  const t = l[kind], key = `tb-code-${l.id}-${kind}`;
  stage.innerHTML = `<p class="task">${kind === "workshop" ? `<b>${esc(t.title)}.</b> ` : ""}${esc(t.prompt ?? t.brief)}</p>
    <div class="code-card" id="card"><div class="code-head"><span>${kind}.py</span><span class="acts"><button class="chipbtn" id="reset">Reset</button><button class="chipbtn go" id="run">${ICON.play} Run</button></span></div>
      <div id="edslot"></div><div class="console" id="con"><span class="lbl">Output</span><span class="body muted">Press Run, or Ctrl + Enter.</span></div></div>
    <div id="help"></div>
    <div class="foot"><button class="btn" id="next">${kind === "practice" ? "Continue to Workshop" : "Continue to Teach"}</button></div>`;
  let running = false;
  const ed = createEditor({ value: store.get(key, t.starter), auto: true, onChange: (v) => store.set(key, v), onRun: () => run() });
  $("edslot").appendChild(ed.el);
  const con = $("con"), body = () => con.querySelector(".body");
  async function run() {
    if (running) return; running = true; $("run").disabled = true; $("help").innerHTML = ""; con.classList.remove("err");
    body().className = "body muted"; body().textContent = pyWarm ? "Running…" : "Starting Python for the first time…";
    try {
      const { out, error } = await runPython(ed.get());
      if (error) {
        con.classList.add("err"); body().className = "body";
        const lines = error.split("\n"); body().textContent = (out ? out : "") + lines.slice(-3).join("\n");
        const hit = HELP.find(([re]) => re.test(error)), at = error.match(/line (\d+)/);
        $("help").innerHTML = `<div class="friendly"><b>What this means</b>${hit ? hit[1](error.match(hit[0])) : "Python stopped with an error. Read the last line above for the clue."}${at ? ` Look near line ${at[1]}.` : ""}</div>`;
      } else { body().className = "body"; if (out) body().textContent = out; else { body().className = "body muted"; body().textContent = "Ran fine. Nothing was printed, so add a print() to see a result."; } }
    } catch (e) { con.classList.add("err"); body().className = "body"; body().textContent = e.message; }
    running = false; $("run").disabled = false;
  }
  $("run").onclick = run; $("reset").onclick = () => ed.set(t.starter); $("next").onclick = () => next(kind);
}

/* ================= speech ================= */
let speakGen = 0, speakQueue = Promise.resolve(), audioEl = null, voiceList = [];
const VOICE_STYLE = { maya: { pitch: 1.15, rate: 1.03, i: 0 }, kofi: { pitch: .75, rate: .97, i: 1 }, zee: { pitch: 1.4, rate: .92, i: 2 } };
if ("speechSynthesis" in window) { const ld = () => (voiceList = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"))); ld(); speechSynthesis.onvoiceschanged = ld; }
const setSpeaking = (id, on) => $("s-" + id)?.classList.toggle("speaking", on);
function stopSpeaking() { speakGen++; speakQueue = Promise.resolve(); window.speechSynthesis?.cancel(); audioEl?.pause(); document.querySelectorAll(".student.speaking").forEach((e) => e.classList.remove("speaking")); }
function speak(id, text) {
  const g = speakGen;
  speakQueue = speakQueue.then(async () => {
    if (muted || g !== speakGen) return;
    setSpeaking(id, true);
    try {
      if (cfg.elevenlabs) {
        const r = await fetch("/api/tts", { method: "POST", body: JSON.stringify({ student: id, text }) });
        if (r.ok) { audioEl = new Audio(URL.createObjectURL(await r.blob())); await new Promise((ok) => { audioEl.onended = ok; audioEl.onerror = ok; audioEl.onpause = ok; audioEl.play().catch(ok); }); return; }
      }
      if (!("speechSynthesis" in window)) return;
      await new Promise((ok) => {
        const u = new SpeechSynthesisUtterance(text), st = VOICE_STYLE[id]; u.pitch = st.pitch; u.rate = st.rate;
        if (voiceList.length) u.voice = voiceList[(st.i * 2) % voiceList.length];
        u.onend = ok; u.onerror = ok; speechSynthesis.speak(u);
      });
    } finally { setSpeaking(id, false); }
  });
}
async function* readLines(stream) {
  const rd = stream.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (ln) yield ln; } }
  if (buf.trim()) yield buf.trim();
}

/* ================= classroom ================= */
function viewTeach(l, stage) {
  const lid = l.id, round = store.get(`tb-round-${lid}`, 0), sid = `${baseSession}:${lid}:${round}`, ids = Object.keys(cfg.students);
  const ctx = { alive: true }; cleanup = () => { ctx.alive = false; stopSpeaking(); try { rec?.abort(); } catch {} };
  const C = 2 * Math.PI * 29;
  stage.innerHTML = `<div class="teach">
    <section class="code-card screen"><div class="code-head"><span>shared screen</span><span class="acts"><button class="chipbtn" id="mine">Use my code</button><button class="chipbtn" id="fresh">New chat</button></span></div><div id="edslot" style="display:flex;flex:1;min-height:0"></div></section>
    <section class="room">
      <div class="orbs">${ids.map((id) => `<div class="student" id="s-${id}" style="--c:var(--${id})"><div class="orbwrap"><svg viewBox="0 0 64 64"><circle class="t" cx="32" cy="32" r="29"/><circle class="p" cx="32" cy="32" r="29" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><div class="orb"></div></div>
        <div class="nm">${cfg.students[id].name}</div><div class="rl">${esc(cfg.students[id].role)}</div><div class="score"></div></div>`).join("")}</div>
      <div class="feed" id="feed"><div class="empty" id="empty"><h2>Explain it like they're in the room.</h2><p>Tap the microphone and talk through the code. ${ids.map((i) => cfg.students[i].name).join(", ").replace(/, ([^,]*)$/, " and $1")} will ask questions.</p></div></div>
      <div class="composer"><div class="cbox"><textarea id="say" rows="1" placeholder="Type, or tap the mic and talk"></textarea>
        <button class="round ghost" id="mute" aria-label="Toggle spoken replies" title="Spoken replies"></button>
        <button class="round" id="mic" aria-label="Speak" title="Speak">${ICON.mic}</button>
        <button class="round" id="send" aria-label="Send" title="Send" disabled>${ICON.send}</button></div><p class="hint" id="hint"></p></div>
    </section></div>`;
  const key = `tb-code-${lid}-teach`;
  const ed = createEditor({ value: store.get(key, l.example), onChange: (v) => store.set(key, v) });
  $("edslot").appendChild(ed.el);
  const feed = $("feed"), say = $("say"), hint = (t, live) => { $("hint").textContent = t; $("hint").className = "hint" + (live ? " live" : ""); };
  const scrollDown = () => (feed.scrollTop = feed.scrollHeight);
  const resetHint = () => hint("Enter to send · Shift + Enter for a new line");
  const clearEmpty = () => $("empty")?.remove();
  const setMuteIcon = () => { $("mute").innerHTML = muted ? ICON.muted : ICON.speaker; };
  setMuteIcon(); resetHint();
  const setScore = (id, u) => { const s = $("s-" + id); s.querySelector(".p").style.strokeDashoffset = C * (1 - u / 10); s.querySelector(".score").textContent = `${u}/10`; };
  const setThinking = (id, on) => $("s-" + id)?.classList.toggle("thinking", on);

  const addYou = (text) => { clearEmpty(); const d = document.createElement("div"); d.className = "msg you"; d.textContent = text; feed.appendChild(d); scrollDown(); };
  const addStudent = (id, text, cls = "") => {
    const d = document.createElement("div"); d.className = "msg st " + cls; d.style.setProperty("--c", `var(--${id})`);
    d.innerHTML = `<div class="who"><i></i>${esc(cfg.students[id].name)}</div><div class="bub">${text === null ? '<div class="dots"><i></i><i></i><i></i></div>' : esc(text)}</div>`;
    feed.appendChild(d); scrollDown(); return d;
  };
  const fill = (el, text, cls = "") => { el.className = "msg st " + cls; el.querySelector(".bub").textContent = text; };
  const addWin = () => {
    const i = lessons.indexOf(l), nx = lessons[i + 1], d = document.createElement("div"); d.className = "win";
    d.innerHTML = `<h3>Lesson complete</h3><p>All three students understood you.</p><button class="btn" id="nextl">${nx ? "Next: " + esc(nx.title) : "Back to the course"}</button>`;
    feed.appendChild(d); scrollDown(); d.querySelector("button").onclick = () => go(nx ? `#/lesson/${nx.id}/theory` : "#/");
  };

  // restore earlier conversation for this lesson
  fetch("/api/report?sessionId=" + encodeURIComponent(sid)).then((r) => (r.ok ? r.json() : null)).then((s) => {
    if (!s || !ctx.alive || !s.history.length) return;
    clearEmpty();
    for (const t of s.history) t.who === "teacher" ? addYou(t.text) : addStudent(t.who, t.text);
    for (const [id, arr] of Object.entries(s.understanding)) setScore(id, arr[arr.length - 1]);
    feed.style.scrollBehavior = "auto"; scrollDown(); feed.style.scrollBehavior = "";
  }).catch(() => {});

  const autosize = () => { say.style.height = "auto"; say.style.height = Math.min(say.scrollHeight, 120) + "px"; $("send").disabled = busy || !say.value.trim(); };
  let busy = false;
  async function send() {
    const text = say.value.trim(); if (busy || !text) return;
    busy = true; stopSpeaking(); addYou(text); say.value = ""; autosize(); hint("The students are thinking…");
    const waits = {}, latest = {}; let failed = false;
    for (const id of ids) { waits[id] = addStudent(id, null, "wait"); setThinking(id, true); }
    try {
      const r = await fetch("/api/turn", { method: "POST", body: JSON.stringify({ sessionId: sid, topic: l.teach.topic, code: ed.get(), utterance: text }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Server error " + r.status);
      for await (const line of readLines(r.body)) {
        if (!ctx.alive) return;
        const ev = JSON.parse(line);
        if (ev.type === "reply") { fill(waits[ev.id], ev.question); setThinking(ev.id, false); setScore(ev.id, ev.understanding); latest[ev.id] = ev.understanding; speak(ev.id, ev.question); scrollDown(); }
        else if (ev.type === "error") { failed = true; fill(waits[ev.id], "Couldn't think of a question this time.", "fail"); setThinking(ev.id, false); }
        else if (ev.type === "fatal") throw new Error(ev.message);
      }
      if (!failed && ids.every((id) => (latest[id] ?? 0) >= 7)) { if (!isDone(lid, "teach")) { markDone(lid, "teach"); $("seg")?.querySelector('[data-p="teach"]')?.classList.add("done"); } addWin(); }
    } catch (e) {
      if (!ctx.alive) return;
      for (const id of ids) { waits[id].remove(); setThinking(id, false); }
      const d = document.createElement("div"); d.className = "sys";
      d.innerHTML = `${esc(e.message)}<br><button class="link" id="chk">Check the AI model</button>`; feed.appendChild(d); scrollDown();
      d.querySelector("#chk").onclick = openPop; say.value = text; autosize();
    }
    busy = false; if (ctx.alive) { for (const id of ids) setThinking(id, false); resetHint(); autosize(); say.focus(); }
  }
  say.oninput = autosize;
  say.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  $("send").onclick = send;
  $("mute").onclick = () => { muted = !muted; store.set("tb-muted", muted); if (muted) stopSpeaking(); setMuteIcon(); };
  $("mine").onclick = () => ed.set(store.get(`tb-code-${lid}-workshop`, store.get(`tb-code-${lid}-practice`, l.example)));
  $("fresh").onclick = () => { store.set(`tb-round-${lid}`, round + 1); route(); };

  // voice in: tap to start, tap again to stop and send
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, recording = false, sendAfter = false, base = "";
  const micUI = () => { $("mic").classList.toggle("rec", recording); $("mic").innerHTML = recording ? ICON.stop : ICON.mic; $("send").classList.toggle("hidden", recording); };
  if (SR) {
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e) => { say.value = base + Array.from(e.results).map((r) => r[0].transcript).join(" "); autosize(); };
    rec.onerror = (e) => { sendAfter = false; recording = false; micUI(); hint(e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it in the address bar, or type instead." : e.error === "no-speech" ? "Didn't hear anything. Tap the mic and try again." : "Voice stopped (" + e.error + "). You can type instead."); };
    rec.onend = () => { recording = false; micUI(); if (sendAfter) { sendAfter = false; send(); } else if (!$("hint").textContent.startsWith("The mic") && $("hint").className.includes("live")) resetHint(); };
  }
  $("mic").onclick = () => {
    if (!SR) return hint("Voice input works in Chrome, Edge or Safari. You can type instead.");
    if (busy) return;
    if (recording) { sendAfter = true; hint("Sending…"); rec.stop(); return; }
    stopSpeaking(); base = say.value.trim() ? say.value.trim() + " " : "";
    try { rec.start(); recording = true; micUI(); hint("Listening… tap again to send", true); } catch {}
  };
  autosize(); say.focus({ preventScroll: true });
}

init();
