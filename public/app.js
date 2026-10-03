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
function markDone(lid, p) {
  const was = !!progress[lid]?.[p]; (progress[lid] ??= {})[p] = true; store.set("tb-progress", progress);
  touchDay(); updateRing(); if (!was) checkMilestones(lid, p);
}
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
  const cloud = isCloud(cfg.model), priv = `<div class="priv"><h4>What stays on this device</h4>
    <div class="row2"><b>AI students</b><span>${cloud ? "Runs on Ollama's servers" : cfg.hosted ? "Runs on the host's server" : "Local model"}</span><i class="${cloud || cfg.hosted ? "warn" : "good"}">${cloud || cfg.hosted ? "off device" : "private"}</i></div>
    <div class="row2"><b>Your voice</b><span>Browser speech recognition. In Chrome and Edge the audio goes to Google or Microsoft. Type to keep it local.</span><i class="warn">cloud</i></div>
    <div class="row2"><b>Your code</b><span>Python runs inside your browser.</span><i class="good">private</i></div>
    <div class="row2"><b>Progress</b><span>Saved only in this browser.</span><i class="good">private</i></div></div>`;
  if (cfg.hosted) { pop.innerHTML = `<h4>AI model</h4><p><b>${esc(cfg.model)}</b> is set by the host of this site.</p>${priv}`; return; }
  pop.innerHTML = `<h4>AI model</h4>${rows || `<p>${d.unreachable ? "Can't reach Ollama. Open the Ollama app, then try again." : "No models installed yet. In a terminal run <code>ollama pull gemma3:4b</code>."}</p>`}
    ${d.installed.some((m) => /gemma/i.test(m.name)) ? "" : `<p>Tip: a local Gemma model keeps the students on this device.</p>`}${priv}`;
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
  if (area === "certificate") { renderedLesson = null; certificatePage(); }
  else if (l) lessonPage(l, PHASES.includes(ph) ? ph : (PHASES.find((p) => !isDone(l.id, p)) ?? "theory"));
  else { renderedLesson = null; homePage(); }
}
const go = (hash) => { location.hash = hash; };

/* ================= home ================= */
function homePage() {
  const t = nextTarget(), done = stepsDone(), total = lessons.length * 4, hr = new Date().getHours();
  const started = done > 0;
  $("view").innerHTML = `<div class="page">
    <p class="eyebrow">${getName() ? `Welcome${started ? " back" : ""}, ${esc(getName())}` : esc(course.title)}</p>
    <h1 class="display">Learn it.<br><em>Then teach it back.</em></h1>
    <p class="lede">Read a short lesson, write a little code, then explain it out loud to three curious students. If you can make them understand, you really understand it.</p>
    ${getName() ? "" : `<form class="namebox" id="nameform"><input id="nm" placeholder="What should we call you? (shown on your certificate)" maxlength="40" aria-label="Your name"><button class="btn soft" type="submit">Save</button></form>`}
    ${t ? `<div class="continue"><div><small>${started ? (hr < 12 ? "Good morning · pick up where you left off" : "Pick up where you left off") : "Start here"}</small><strong>${esc(t.l.title)} · ${PHASE_LABEL[t.p]}</strong></div>
      <button class="btn" id="cont">${started ? "Continue" : "Begin"}</button></div>`
      : `<div class="continue"><div><small>All done</small><strong>You finished the whole course.</strong></div></div>`}
    <div class="overall"><div class="track"><i style="width:${(done / total) * 100}%"></i></div><span>${done} of ${total} steps</span></div>
    <div class="chips"><span class="chip ${streak() ? "hot" : ""}">${streak() ? streak() + "-day streak" : "Start a streak today"}</span><span class="chip">${store.get("tb-stats", { turns: 0 }).turns} explanations given</span></div>
    ${course.modules.map((m) => `<h3 class="group-title">${esc(m.title)}</h3><div class="group">${m.lessons.map((l) => {
      const n = lessons.indexOf(l) + 1, all = PHASES.every((p) => isDone(l.id, p));
      return `<a class="item ${all ? "done" : ""}" href="#/lesson/${l.id}"><span class="num">${all ? "✓" : n}</span><span class="t">${esc(l.title)}</span>
        <span class="pips">${PHASES.map((p) => `<i class="${isDone(l.id, p) ? "on" : ""}"></i>`).join("")}</span>${ICON.chev}</a>`;
    }).join("")}</div>`).join("")}
    <a class="cert-row ${courseComplete() ? "ready" : ""}" href="#/certificate">${svg('<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>')}<div><b>Certificate</b><span>${courseComplete() ? "Ready. Claim yours" : `Unlocks when all ${total} steps are done`}</span></div></a>
  </div>`;
  if (t) $("cont").onclick = () => go(`#/lesson/${t.l.id}/${t.p}`);
  if ($("nameform")) $("nameform").onsubmit = (e) => { e.preventDefault(); const v = $("nm").value.trim(); if (v) { store.set("tb-name", v); homePage(); } };
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
      <div class="ideas" id="ideas"><small>Explain</small>${(l.rubric ?? []).map((r) => `<span class="idea" data-id="${r.id}">${esc(r.label)}</span>`).join("")}</div>
      <div class="feed" id="feed"><div class="empty" id="empty"><h2>Explain it like they're in the room.</h2><p>Cover the ideas above in your own words. Each lights up when you've explained it correctly. ${ids.map((i) => cfg.students[i].name).join(", ").replace(/, ([^,]*)$/, " and $1")} will ask questions.</p></div></div>
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
  const setScore = (id, u) => { const s = $("s-" + id); s.querySelector(".p").style.strokeDashoffset = C * (1 - u / 10);  };
  const rubric = l.rubric ?? []; let covered = [];
  const setCovered = (ids, animate) => {
    for (const id of ids) { const el = document.querySelector(`.idea[data-id="${id}"]`); if (el && !el.classList.contains("on")) { el.classList.add("on"); if (animate) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); } } }
    covered = [...new Set([...covered, ...ids])];
  };
  const allCovered = () => rubric.length > 0 && rubric.every((r) => covered.includes(r.id));
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
    d.innerHTML = `<h3>Lesson complete</h3><p>You explained every key idea in your own words.</p><button class="btn" id="nextl">${nx ? "Next: " + esc(nx.title) : "Back to the course"}</button>`;
    feed.appendChild(d); scrollDown(); d.querySelector("button").onclick = () => go(nx ? `#/lesson/${nx.id}/theory` : "#/");
  };

  // restore earlier conversation for this lesson
  fetch("/api/report?sessionId=" + encodeURIComponent(sid)).then((r) => (r.ok ? r.json() : null)).then((s) => {
    if (!s || !ctx.alive || !s.history.length) return;
    clearEmpty();
    for (const t of s.history) t.who === "teacher" ? addYou(t.text) : addStudent(t.who, t.text);
    for (const [id, arr] of Object.entries(s.understanding)) setScore(id, arr[arr.length - 1]);
    setCovered(s.covered ?? [], false); turnsHere = s.history.filter((t) => t.who === "teacher").length; maybeAssist();
    feed.style.scrollBehavior = "auto"; scrollDown(); feed.style.scrollBehavior = "";
  }).catch(() => {});

  const autosize = () => { say.style.height = "auto"; say.style.height = Math.min(say.scrollHeight, 120) + "px"; $("send").disabled = busy || !say.value.trim(); };
  let busy = false, turnsHere = 0, winShown = false;
  function maybeAssist() {
    if (turnsHere < 8 || allCovered() || isDone(lid, "teach") || $("assist")) return;
    const d = document.createElement("div"); d.className = "assist"; d.id = "assist";
    d.innerHTML = `<button class="link">Taking long? Finish this lesson anyway</button>`; feed.appendChild(d); scrollDown();
    d.querySelector("button").onclick = () => { const a = store.get("tb-assisted", {}); a[lid] = true; store.set("tb-assisted", a); winShown = true; markDone(lid, "teach"); $("seg")?.querySelector('[data-p="teach"]')?.classList.add("done"); d.remove(); addWin(); };
  }
  async function send() {
    const text = say.value.trim(); if (busy || !text) return;
    busy = true; { const st = store.get("tb-stats", { turns: 0 }); st.turns++; store.set("tb-stats", st); } stopSpeaking(); addYou(text); say.value = ""; autosize(); hint("The students are thinking…");
    const waits = {}, latest = {}; let failed = false;
    for (const id of ids) { waits[id] = addStudent(id, null, "wait"); setThinking(id, true); }
    try {
      const r = await fetch("/api/turn", { method: "POST", body: JSON.stringify({ sessionId: sid, lessonId: lid, topic: l.teach.topic, code: ed.get(), utterance: text }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Server error " + r.status);
      for await (const line of readLines(r.body)) {
        if (!ctx.alive) return;
        const ev = JSON.parse(line);
        if (ev.type === "reply") { fill(waits[ev.id], ev.question); setThinking(ev.id, false); setScore(ev.id, ev.understanding); latest[ev.id] = ev.understanding; speak(ev.id, ev.question); scrollDown(); }
        else if (ev.type === "error") { failed = true; fill(waits[ev.id], "Couldn't think of a question this time.", "fail"); setThinking(ev.id, false); }
        else if (ev.type === "coverage") { const fresh = ev.covered.filter((x) => !covered.includes(x)); setCovered(ev.covered, true); if (fresh.length) hint(`${fresh.length === 1 ? "Nice, one more idea covered" : fresh.length + " more ideas covered"}`); }
        else if (ev.type === "fatal") throw new Error(ev.message);
      }
      turnsHere++;
      if (allCovered() && !winShown) { winShown = true; if (!isDone(lid, "teach")) { markDone(lid, "teach"); $("seg")?.querySelector('[data-p="teach"]')?.classList.add("done"); } addWin(); }
      else maybeAssist();
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

/* ================= identity, streak ================= */
const getName = () => store.get("tb-name", "");
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
function touchDay() { const d = store.get("tb-days", []); if (!d.includes(dayKey())) { d.push(dayKey()); store.set("tb-days", d.slice(-400)); } }
function streak() {
  const d = new Set(store.get("tb-days", [])), t = new Date(); let n = 0;
  if (!d.has(dayKey(t))) t.setDate(t.getDate() - 1);
  while (d.has(dayKey(t))) { n++; t.setDate(t.getDate() - 1); }
  return n;
}
const lessonComplete = (l) => PHASES.every((p) => isDone(l.id, p));
const courseComplete = () => lessons.every(lessonComplete);

/* ================= share cards (SVG -> PNG) ================= */
let svgSeq = 0;
const ORBS = (id, cx, cy, r) => ["maya", "kofi", "zee"].map((k, i) => {
  const c = { maya: "#e9a23b", kofi: "#5a8dee", zee: "#43b58a" }[k], gid = `${id}${k}`;
  return `<defs><radialGradient id="${gid}" cx=".32" cy=".26" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
    <circle cx="${cx + i * r * 1.25}" cy="${cy}" r="${r}" fill="${c}"/><circle cx="${cx + i * r * 1.25}" cy="${cy}" r="${r}" fill="url(#${gid})"/>`;
}).join("");
const wrap = (t, n) => { const out = []; let line = ""; for (const w of String(t).split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out.slice(0, 3); };
const SERIF = "ui-serif, 'New York', Georgia, serif", SANS = "-apple-system, 'Segoe UI', system-ui, sans-serif";

function cardSVG(m) {
  const id = "c" + ++svgSeq, hl = wrap(m.headline, m.headline.length > 26 ? 24 : 18), size = hl.length > 1 ? 72 : 88, sub = wrap(m.sub, 52);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><rect width="1200" height="630" fill="#0c0c0d"/>
    <ellipse cx="1000" cy="120" rx="420" ry="300" fill="#e9a23b" opacity=".07"/><ellipse cx="160" cy="620" rx="420" ry="260" fill="#5a8dee" opacity=".07"/>
    <text x="80" y="110" font-family="${SANS}" font-size="26" font-weight="700" fill="#f5f5f7" letter-spacing="-.5">Teach<tspan font-family="${SERIF}" font-style="italic" font-weight="500" font-size="30">Back</tspan></text>
    <text x="80" y="200" font-family="${SANS}" font-size="22" font-weight="600" fill="#98989d" letter-spacing="3">${esc(m.title.toUpperCase())}</text>
    ${hl.map((ln, i) => `<text x="80" y="${290 + i * (size + 8)}" font-family="${SERIF}" font-size="${size}" font-weight="600" fill="#f5f5f7" letter-spacing="-2">${esc(ln)}</text>`).join("")}
    ${sub.map((ln, i) => `<text x="80" y="${290 + hl.length * (size + 8) + 20 + i * 36}" font-family="${SERIF}" font-size="28" fill="#98989d">${esc(ln)}</text>`).join("")}
    ${ORBS(id, 880, 520, 46)}
    <text x="80" y="580" font-family="${SANS}" font-size="22" fill="#636366">Learn it. Then teach it back. · Open-source AI · #Hacktoberfest</text></svg>`;
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
function certId(name, iso) { let h = 2166136261; for (const c of name + iso + lessons.length) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } const t = (h >>> 0).toString(36).toUpperCase().padStart(8, "0"); return `TB-${t.slice(0, 4)}-${t.slice(4, 8)}`; }
function certSVG(name, iso) {
  const id = "z" + ++svgSeq, st = store.get("tb-stats", { turns: 0 }), nm = name || "Your Name", nsz = nm.length > 24 ? 64 : 84;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 850" width="1200" height="850"><rect width="1200" height="850" fill="#fbfaf6"/>
    <rect x="34" y="34" width="1132" height="782" rx="6" fill="none" stroke="#1d1d1f" stroke-width="2"/><rect x="48" y="48" width="1104" height="754" rx="3" fill="none" stroke="#1d1d1f" stroke-opacity=".25" stroke-width="1"/>
    ${ORBS(id, 540, 150, 24)}
    <text x="600" y="232" text-anchor="middle" font-family="${SANS}" font-size="26" font-weight="700" fill="#1d1d1f" letter-spacing="-.5">Teach<tspan font-family="${SERIF}" font-style="italic" font-weight="500" font-size="30">Back</tspan></text>
    <text x="600" y="320" text-anchor="middle" font-family="${SERIF}" font-size="60" font-weight="600" fill="#1d1d1f" letter-spacing="-1.5">Certificate of Completion</text>
    <text x="600" y="385" text-anchor="middle" font-family="${SERIF}" font-size="24" font-style="italic" fill="#6e6e73">This certifies that</text>
    <text x="600" y="480" text-anchor="middle" font-family="${SERIF}" font-size="${nsz}" font-style="italic" font-weight="500" fill="#1d1d1f" letter-spacing="-1">${esc(nm)}</text>
    <line x1="300" y1="508" x2="900" y2="508" stroke="#1d1d1f" stroke-opacity=".3"/>
    <text x="600" y="565" text-anchor="middle" font-family="${SERIF}" font-size="26" fill="#1d1d1f">completed <tspan font-weight="700">${esc(course.title)}</tspan></text>
    <text x="600" y="606" text-anchor="middle" font-family="${SERIF}" font-size="22" fill="#6e6e73">${lessons.length} lessons, each taught back out loud to three AI students</text>
    <text x="600" y="640" text-anchor="middle" font-family="${SERIF}" font-size="22" fill="#6e6e73">${st.turns} explanations given · ${lessons.length - Object.keys(store.get("tb-assisted", {})).length} of ${lessons.length} lessons verified by an examiner</text>
    <text x="150" y="738" font-family="${SANS}" font-size="16" fill="#6e6e73" letter-spacing="1">DATE</text><text x="150" y="766" font-family="${SERIF}" font-size="24" fill="#1d1d1f">${esc(fmtDate(iso))}</text>
    <text x="1050" y="738" text-anchor="end" font-family="${SANS}" font-size="16" fill="#6e6e73" letter-spacing="1">CERTIFICATE ID</text><text x="1050" y="766" text-anchor="end" font-family="${SANS}" font-size="22" font-weight="600" fill="#1d1d1f" letter-spacing="1">${certId(nm, iso)}</text>
    <text x="600" y="790" text-anchor="middle" font-family="${SANS}" font-size="13" fill="#a1a1a6">Self-paced learning certificate issued by TeachBack. Not an accredited qualification.</text></svg>`;
}
async function svgToPng(str, w, h) {
  const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" })), img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}
function saveBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ================= sharing ================= */
const shareUrl = () => cfg.shareUrl || location.origin;
function shareButtons(text, svgStr, w, h, file) {
  const u = encodeURIComponent(shareUrl()), t = encodeURIComponent(text);
  const links = [["X", `https://twitter.com/intent/tweet?text=${t}&url=${u}`], ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`], ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(text + " " + shareUrl())}`]];
  return `<div class="sharerow">${navigator.share ? `<button class="btn" data-a="native">Share…</button>` : ""}
    ${links.map(([n, h2]) => `<a class="btn soft" href="${h2}" target="_blank" rel="noopener">${n}</a>`).join("")}
    <button class="btn soft" data-a="copy">Copy text</button><button class="btn soft" data-a="img">Save image</button></div>`;
}
function wireShare(root, text, svgStr, w, h, file) {
  root.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
    const a = b.dataset.a, orig = b.textContent;
    try {
      if (a === "img") saveBlob(await svgToPng(svgStr, w, h), file);
      else if (a === "copy") { await navigator.clipboard.writeText(text + " " + shareUrl()); b.textContent = "Copied ✓"; setTimeout(() => (b.textContent = orig), 1500); }
      else if (a === "native") {
        const png = await svgToPng(svgStr, w, h), f = new File([png], file, { type: "image/png" });
        const data = { text, url: shareUrl(), title: "TeachBack" }; if (navigator.canShare?.({ files: [f] })) data.files = [f];
        await navigator.share(data);
      }
    } catch (e) { if (e?.name !== "AbortError") { b.textContent = "Couldn't. Try Save image"; setTimeout(() => (b.textContent = orig), 2200); } }
  }));
}

/* ================= milestones ================= */
function checkMilestones(lid, phase) {
  const l = lessons.find((x) => x.id === lid), m = course.modules.find((x) => x.lessons.includes(l)), seen = store.get("tb-milestones", {}), found = [];
  if (lessonComplete(l) && !seen["l:" + lid]) { seen["l:" + lid] = 1; found.push({ kind: "lesson", title: "Lesson complete", headline: l.title, sub: `I just finished "${l.title}" on TeachBack by teaching it back to three AI students.`, line: "Theory, Practice, Workshop and Teach: all done." }); }
  if (m.lessons.every(lessonComplete) && !seen["m:" + m.id]) { seen["m:" + m.id] = 1; found.push({ kind: "module", title: "Module complete", headline: m.title, sub: `I finished the "${m.title}" module of ${course.title} on TeachBack.`, line: `You've completed every lesson in ${m.title}.` }); }
  if (courseComplete() && !seen.course) { seen.course = 1; if (!store.get("tb-completed", "")) store.set("tb-completed", new Date().toISOString()); found.push({ kind: "course", title: "Course complete", headline: course.title, sub: `I completed ${course.title} on TeachBack: learn it, then teach it back to three AI students.`, line: "Every lesson, taught back out loud. Your certificate is ready." }); }
  if (!found.length) return;
  store.set("tb-milestones", seen);
  const top = found[found.length - 1]; setTimeout(() => showMilestone(top), phase === "teach" ? 1600 : 400);
}
function showMilestone(m) {
  const svgStr = cardSVG(m), text = m.sub + " #Hacktoberfest #OpenSource", modal = $("modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="sheet"><div class="card">${svgStr}</div><h2>${esc(m.title)}</h2><p>${esc(m.line)} Share it with someone who'd love to learn too.</p>
    ${shareButtons(text)}<div class="acts"><button class="link" id="later">Maybe later</button>${m.kind === "course" ? `<button class="btn" id="getcert">View certificate</button>` : `<button class="btn" id="keep">Keep going</button>`}</div></div>`;
  wireShare(modal, text, svgStr, 1200, 630, `teachback-${m.kind}.png`);
  const close = () => { modal.classList.add("hidden"); modal.innerHTML = ""; };
  modal.onclick = (e) => e.target === modal && close(); $("later").onclick = close;
  if ($("keep")) $("keep").onclick = close; if ($("getcert")) $("getcert").onclick = () => { close(); go("#/certificate"); };
  addEventListener("keydown", function esc1(e) { if (e.key === "Escape") { close(); removeEventListener("keydown", esc1); } });
}

/* ================= certificate ================= */
function certificatePage() {
  const done = stepsDone(), total = lessons.length * 4;
  if (!courseComplete()) {
    $("view").innerHTML = `<div class="page"><p class="eyebrow">Certificate</p><h1 class="display">Earn it by <em>teaching</em>.</h1>
      <div class="locked"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin:auto"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      <h2>${done} of ${total} steps done</h2><p>Finish every lesson, including teaching it back to all three students, and your certificate unlocks here.</p><button class="btn" id="cont">Continue learning</button></div></div>`;
    $("cont").onclick = () => { const t = nextTarget(); go(t ? `#/lesson/${t.l.id}/${t.p}` : "#/"); }; return;
  }
  const iso = store.get("tb-completed", "") || (store.set("tb-completed", new Date().toISOString()), store.get("tb-completed", ""));
  $("view").innerHTML = `<div class="page wide" style="max-width:1000px"><p class="eyebrow noprint">Certificate</p><h1 class="display noprint">You did it${getName() ? ", " + esc(getName().split(" ")[0]) : ""}.</h1>
    <div class="certbar noprint"><input id="nm" value="${esc(getName())}" placeholder="Your name as it should appear" maxlength="40" aria-label="Name on certificate"></div>
    <div class="certwrap" id="cert"></div>
    <div class="certbar noprint"><button class="btn" id="dl">Download image</button><button class="btn soft" id="pr">Save as PDF / Print</button></div>
    <div class="noprint" id="sh"></div></div>`;
  const draw = () => {
    const name = getName(), svgStr = certSVG(name, iso), text = `I completed ${course.title} on TeachBack and taught every lesson back to three AI students. #Hacktoberfest #OpenSource`;
    $("cert").innerHTML = svgStr; $("sh").innerHTML = shareButtons(text);
    wireShare($("sh"), text, svgStr, 1200, 850, "teachback-certificate.png");
    $("dl").onclick = async () => saveBlob(await svgToPng(svgStr, 2400, 1700), "teachback-certificate.png");
  };
  $("pr").onclick = () => print();
  let tm; $("nm").oninput = (e) => { store.set("tb-name", e.target.value.trim()); clearTimeout(tm); tm = setTimeout(draw, 250); };
  draw(); scrollTo(0, 0);
}

init();
