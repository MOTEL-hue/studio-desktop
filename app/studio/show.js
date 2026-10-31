/* אולפן שידור - תוכנית אוטומטית לפי זמנים, שלט מהטלפון, ושיוך מקשים (מקלדת, שלט מצגות, MIDI, בקר משחק). */
(function () {
"use strict";
const S = window.Studio, U = S.ui, h = U.h, $ = U.$;
S.show = { steps: [], loop: false, startAt: "" };
const run = S.run = { on: false, paused: false, idx: -1, t0: 0, acc: 0, armed: false, played: [] };
const dur = st => (+st.min || 0) * 60 + (+st.sec || 0);
const elapsed = () => (run.paused ? run.acc : run.acc + (performance.now() - run.t0) / 1000);
S.showElapsed = elapsed;
const sceneName = id => (S.scene(id) || {}).name || "(סצנה נמחקה)";
const fmt = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
U.fmtMS = fmt;

/* ---------- ההרצה ---------- */
function stopMedia() { run.played.forEach(id => { const s = S.src(id); if (s && s.el && s.el.pause) s.el.pause(); }); run.played = []; }
function enter(i) {
  const st = S.show.steps[i]; if (!st) return finish();
  stopMedia(); run.idx = i; run.t0 = performance.now(); run.acc = 0; run.paused = false;
  if (S.scene(st.scene)) { if (S.trans) S.trans = null; S.goLive(st.scene, st.trans || undefined); }
  if (st.ovMode !== "keep") S.overlays.forEach(o => { o.on = (st.ov || []).includes(o.id); });
  (st.play || []).forEach(id => { const s = S.src(id); if (s && s.el && s.el.play) { S.ensureAudio(); s.el.currentTime = 0; s.el.play().catch(() => {}); run.played.push(id); } });
  S.emit("show"); if (U.tab === "overlays") U.renderOverlays();
}
function finish() { stopMedia(); run.on = false; run.paused = false; run.idx = -1; S.emit("show"); U.toast("התוכנית הסתיימה"); }
S.showStart = function (i) {
  if (!S.show.steps.length) { U.toast("אין שלבים בתוכנית", true); return; }
  run.on = true; run.armed = false; S.ensureAudio(); enter(i == null ? 0 : i);
};
S.showNext = function () { if (!run.on) return; const n = run.idx + 1; if (n < S.show.steps.length) enter(n); else if (S.show.loop) enter(0); else finish(); };
S.showPrev = function () { if (!run.on) return; if (elapsed() > 3 || run.idx === 0) enter(run.idx); else enter(run.idx - 1); };
S.showPause = function () { if (!run.on) return; if (run.paused) { run.paused = false; run.t0 = performance.now(); } else { run.acc = elapsed(); run.paused = true; } S.emit("show"); };
S.showStop = function () { if (run.on) finish(); run.armed = false; S.emit("show"); };
setInterval(() => {
  if (run.armed && S.show.startAt && !run.on) { const [hh, mm] = S.show.startAt.split(":").map(Number), d = new Date(); if (d.getHours() === hh && d.getMinutes() === mm) { run.armed = false; S.showStart(0); } }
  if (run.on && !run.paused) { const st = S.show.steps[run.idx], d = st ? dur(st) : 0; if (d > 0 && elapsed() >= d) S.showNext(); }
  S.emit("show");
}, 250);

/* ---------- פעולות (משותפות לשלט, למקשים ול-MIDI) ---------- */
/* היסטוריה: "הקודמת" חוזרת לסצנה שהייתה בשידור לפני כן, ו"הבאה" עוברת לסצנה שהוגדרה כמוצא של הסצנה הנוכחית (או הבאה ברשימה) */
const hist = []; let lastPgm = S.pgm, goingBack = false;
S.on("scenes", () => { if (S.pgm !== lastPgm) { if (lastPgm && !goingBack && S.scene(lastPgm)) { hist.push(lastPgm); if (hist.length > 30) hist.shift(); } lastPgm = S.pgm; goingBack = false; } });
U.nextScene = function () {
  const list = S.scenes.filter(s => !s.brb && !s.replay), cur = S.scene(S.pgm); if (!list.length) return null;
  if (cur && cur.next && S.scene(cur.next)) return S.scene(cur.next);
  const i = list.findIndex(s => s.id === S.pgm); return list[(i + 1) % list.length];
};
function cycle(d) {
  if (d > 0) { const n = U.nextScene(); if (n) S.goLive(n.id); return; }
  while (hist.length && !S.scene(hist[hist.length - 1])) hist.pop();
  const id = hist.pop(); if (id && id !== S.pgm) { goingBack = true; S.goLive(id); return; }
  const list = S.scenes.filter(s => !s.brb && !s.replay); if (!list.length) return; const i = list.findIndex(s => s.id === S.pgm); S.goLive(list[(Math.max(i, 0) - 1 + list.length) % list.length].id);
}
U.act = function (c, a) {
  switch (c) {
    case "scene": if (S.scene(a) && a !== S.pgm) S.goLive(a); break;
    case "prep": if (S.scene(a)) { S.pvw = a; S.emit("scenes"); } break;
    case "take": S.take(); break; case "cut": S.take("cut"); break;
    case "next": cycle(1); break; case "prev": cycle(-1); break;
    case "brb": U.brb(); break;
    case "ov": { const o = S.overlays.find(x => x.id === a); if (o) { o.on = !o.on; S.save(); if (U.tab === "overlays") U.renderOverlays(); } break; }
    case "mute": S.settings.masterVol = S.settings.masterVol > 0 ? 0 : 1; S.applyAudioSettings(); S.save(); if (U.tab === "audio") U.renderMixer(); break;
    case "prog": { const m = { start: () => (run.on ? (run.paused ? S.showPause() : null) : S.showStart(0)), pause: () => S.showPause(), next: () => S.showNext(), prev: () => S.showPrev(), stop: () => S.showStop() }; if (m[a]) m[a](); break; }
    case "replay": U.replayNow().catch(e => U.toast(e.message, true)); break;
    case "recpause": S.recPause(); break; case "recstop": S.recStop(); break;
  }
};
const ACTS = () => [["next", "סצנה הבאה"], ["prev", "סצנה קודמת"], ["take", "שידור (מהתצוגה המקדימה)"], ["cut", "חיתוך"], ["brb", "רגע, חוזרים"], ["mute", "השתקה כללית"],
  ["prog:start", "תוכנית: התחלה / המשך"], ["prog:pause", "תוכנית: השהיה"], ["prog:next", "תוכנית: שלב הבא"], ["prog:prev", "תוכנית: שלב קודם"], ["recpause", "הקלטה: השהיה"], ["replay", "הפעלה חוזרת"]]
  .concat(S.scenes.filter(s => !s.brb && !s.replay).map(s => ["scene:" + s.id, "סצנה: " + s.name])).concat(S.overlays.map(o => ["ov:" + o.id, "שכבה: " + o.name]));
const actName = a => (ACTS().find(x => x[0] === a) || [0, a])[1];
function runBind(action) { const [c, ...r] = action.split(":"); U.act(c, r.join(":")); }

/* ---------- מקשים, שלט מצגות, MIDI ובקר משחק ---------- */
S.settings.binds = S.settings.binds || [];
function got(kind, code) {
  if (S._learn) { const f = S._learn; S._learn = null; f(kind, code); return true; }
  const b = (S.settings.binds || []).find(x => x.kind === kind && x.code === code); if (b) { runBind(b.action); return true; } return false;
}
document.addEventListener("keydown", e => {
  if (S._learn) { e.preventDefault(); e.stopPropagation(); got("key", e.code); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || $("#dlg").open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (got("key", e.code)) { e.preventDefault(); return; }
  const builtin = { PageDown: "next", MediaTrackNext: "next", PageUp: "prev", MediaTrackPrevious: "prev",
    NumpadAdd: "next", NumpadSubtract: "prev", NumpadEnter: "take", NumpadMultiply: "cut", Numpad0: "brb", NumpadDivide: "prog:next" }[e.code];
  if (builtin) { e.preventDefault(); const [c, a] = builtin.split(":"); U.act(c, a); return; }
  const pad = /^Numpad([1-9])$/.exec(e.code);  // מקלדת מספרים: מקש = סצנה בשידור מיד
  if (pad) { const sc = S.scenes.filter(s => !s.brb && !s.replay)[+pad[1] - 1]; if (sc) { e.preventDefault(); U.act("scene", sc.id); } }
}, true);
/* עכבר: הכפתור הימני, האמצעי והצדדיים (הכפתור השמאלי נשאר לעבודה רגילה) */
const mouseOk = e => e.button > 0 && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !$("#dlg").open && !e.target.closest(".edit-layer .hd");
const mouseBound = b => !!S._learn || (S.settings.binds || []).some(x => x.kind === "mouse" && x.code === "m" + b);
document.addEventListener("mousedown", e => { if (mouseOk(e) && mouseBound(e.button)) { e.preventDefault(); got("mouse", "m" + e.button); } }, true);
["mouseup", "auxclick", "contextmenu"].forEach(t => document.addEventListener(t, e => { if (mouseOk(e) && mouseBound(e.button)) e.preventDefault(); }, true));
let midiOn = false;
U.midiInit = async function () {
  if (midiOn || !navigator.requestMIDIAccess) return !!midiOn;
  try { const a = await navigator.requestMIDIAccess(); midiOn = true; const hook = () => a.inputs.forEach(i => { i.onmidimessage = m => { const [s, d1, d2] = m.data, t = s & 0xF0;
        if (t === 0x90 && d2 > 0) got("midi", "n" + d1); else if (t === 0xB0 && d2 > 63) got("midi", "c" + d1); else if (t === 0xC0) got("midi", "p" + d1); }; }); hook(); a.onstatechange = hook; return true; }
  catch (e) { U.toast("אין הרשאת MIDI בדפדפן", true); return false; }
};
let padPrev = {}; setInterval(() => {
  if (!(S.settings.pad || S._learn) || !navigator.getGamepads) return;
  for (const g of navigator.getGamepads()) { if (!g) continue; g.buttons.forEach((b, i) => { const k = g.index + ":" + i, was = padPrev[k]; padPrev[k] = b.pressed; if (b.pressed && !was) got("pad", "b" + i); }); }
}, 70);
if (S.settings.midi) U.midiInit();
U.learn = function (done) { S._learn = (kind, code) => done(kind, code); U.toast("לחצו עכשיו על הכפתור, המקש או הפדל שרוצים לשייך..."); };

/* ---------- שלט מהטלפון: סנכרון עם השרת ---------- */
S.remote = { token: "", ok: false, regen: false };
function pubState() {
  const steps = S.show.steps, st = steps[run.idx], d = st ? dur(st) : 0, nx = steps[run.idx + 1] || (S.show.loop ? steps[0] : null);
  const left = d > 0 ? Math.max(0, d - elapsed()) : null, rec = S.rec;
  return { scenes: S.scenes.filter(s => !s.brb && !s.replay).map(s => ({ id: s.id, name: s.name })), pgm: S.pgm, pvw: S.pvw, pgmName: sceneName(S.pgm), brb: !!(S.scene(S.pgm) || {}).brb,
    overlays: S.overlays.map(o => ({ id: o.id, name: o.name, on: !!o.on })), mute: S.settings.masterVol === 0,
    rec: rec ? { on: true, pause: rec.state === "pause", sec: Math.floor(S.recElapsed(rec) / 1000), since: rec.state === "pause" ? null : Date.now() - S.recElapsed(rec) } : { on: false },
    prog: { n: steps.length, running: run.on, paused: run.paused, idx: run.idx, name: st ? sceneName(st.scene) : "", left: left == null ? null : Math.round(left), endAt: left != null && run.on && !run.paused ? Math.round((Date.now() + left * 1000) / 1000) * 1000 : null, next: nx ? sceneName(nx.scene) : "" } };
}
async function syncLoop() {
  let delay = 3000;
  if (S.settings.remoteOn && document.body.dataset.remoteSync) {
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]').content, body = { state: pubState() }; if (S.remote.regen) { body.regen = true; S.remote.regen = false; }
      const r = await fetch(document.body.dataset.remoteSync, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": csrf }, body: JSON.stringify(body) });
      const j = await r.json(); S.remote.token = j.token; S.remote.ok = true; (j.cmds || []).forEach(c => U.act(c.c, c.a)); delay = j.fast ? 500 : 3500;
      if (U.tab === "remote" && !S.remote._shown) { S.remote._shown = true; U.renderRemote(); }
    } catch (e) { S.remote.ok = false; delay = 5000; }
  }
  setTimeout(syncLoop, delay);
}
setTimeout(syncLoop, 1500);

/* ---------- לשונית: תוכנית אוטומטית ---------- */
function stepCard(st, i) {
  const n = S.show.steps.length, ch = () => S.save(), sceneOpts = S.scenes.map(s => [s.id, s.name]);
  const media = S.sources.filter(s => s.kind === "video" || s.kind === "audio"), card = h("div", { class: "step" + (run.on && run.idx === i ? " live" : ""), "data-i": i });
  const chips = (list, key, pickOpts) => pickOpts.map(([id, name]) => h("label", { class: "chipck" }, h("input", { type: "checkbox", checked: (st[key] || []).includes(id), onchange: e => { const a = new Set(st[key] || []); e.target.checked ? a.add(id) : a.delete(id); st[key] = [...a]; ch(); } }), name));
  card.append(h("div", { class: "oh" }, h("b", { text: (i + 1) + "." }), U.sel(sceneOpts, st.scene, v => { st.scene = v; ch(); }),
      h("button", { class: "mini", title: "התחלת התוכנית מהשלב הזה", text: "▶", onclick: () => S.showStart(i) }), h("button", { class: "mini", text: "↑", disabled: i === 0, onclick: () => { [S.show.steps[i - 1], S.show.steps[i]] = [S.show.steps[i], S.show.steps[i - 1]]; ch(); U.renderShow(); } }),
      h("button", { class: "mini", text: "↓", disabled: i === n - 1, onclick: () => { [S.show.steps[i + 1], S.show.steps[i]] = [S.show.steps[i], S.show.steps[i + 1]]; ch(); U.renderShow(); } }),
      h("button", { class: "mini", title: "שכפול", text: "⧉", onclick: () => { S.show.steps.splice(i + 1, 0, Object.assign(JSON.parse(JSON.stringify(st)), { id: S.uid() })); ch(); U.renderShow(); } }),
      h("button", { class: "mini", title: "מחיקה", text: "🗑", onclick: () => { S.show.steps.splice(i, 1); ch(); U.renderShow(); } })),
    h("div", { class: "durrow" }, h("span", { text: "משך:" }), h("input", { type: "number", min: 0, max: 600, value: st.min || 0, oninput: e => { st.min = +e.target.value; ch(); } }), h("span", { text: "דקות" }),
      h("input", { type: "number", min: 0, max: 59, value: st.sec || 0, oninput: e => { st.sec = +e.target.value; ch(); } }), h("span", { text: "שניות" }), h("small", { text: "(0 = עד לחיצה על \"הבא\")" })),
    h("details", { class: "slot" }, h("summary", { text: "אפקט מעבר, שכבות ומדיה בשלב הזה" }),
      U.field("מעבר לסצנה", U.sel([["", "רגיל (לפי ההגדרות)"]].concat(Object.entries(S.TRANS)), st.trans || "", v => { st.trans = v; ch(); })),
      h("p", { class: "fl", text: "שכבות שיוצגו בשלב הזה (שאר השכבות יוסתרו):" }), h("div", { class: "chips" }, chips(S.overlays, "ov", S.overlays.map(o => [o.id, o.name]))),
      U.check("להשאיר את השכבות כמו שהן (לא לשנות)", st.ovMode === "keep", v => { st.ovMode = v ? "keep" : ""; ch(); }),
      media.length ? [h("p", { class: "fl", text: "סרטונים או שמע שיתחילו בשלב הזה (ויעצרו בסופו):" }), h("div", { class: "chips" }, chips(media, "play", media.map(s => [s.id, s.name])))] : h("small", { text: "הוסיפו סרטון או קובץ שמע כמקור כדי שאפשר יהיה להפעיל אותו בשלב." })));
  return card;
}
U.renderShow = function () {
  if (U.tab !== "show") return; const body = $("#tabBody"), sh = S.show; body.innerHTML = "";
  body.append(h("p", { class: "hint", text: "תוכנית אוטומטית: מגדירים שלבים, ולכל שלב סצנה ומשך. האולפן עובר מעצמו מסצנה לסצנה, מחליף שכבות ומפעיל סרטונים לפי הזמנים." }),
    h("div", { class: "prog", id: "showStatus" }), h("div", { class: "bar" }, h("i", { id: "showBar" })),
    h("div", { class: "row" }, h("button", { class: "btn go", id: "pStart", onclick: () => (run.on ? S.showPause() : S.showStart(0)) }), h("button", { class: "btn", text: "⏮ הקודם", onclick: S.showPrev }), h("button", { class: "btn", text: "⏭ הבא", onclick: S.showNext }), h("button", { class: "btn danger", text: "⏹ עצירה", onclick: S.showStop })));
  const list = h("div", { id: "steps" }); sh.steps.forEach((st, i) => list.append(stepCard(st, i))); body.append(list,
    h("div", { class: "row" }, h("button", { class: "btn", text: "➕ שלב חדש", onclick: () => { const last = sh.steps[sh.steps.length - 1]; sh.steps.push({ id: S.uid(), scene: last ? last.scene : (S.scenes[0] || {}).id, min: 1, sec: 0, trans: "", ov: [], play: [] }); S.save(); U.renderShow(); } }),
      h("button", { class: "btn", text: "✨ דוגמה מהסצנות שלי", onclick: () => { sh.steps = S.scenes.filter(s => !s.brb && !s.replay).slice(0, 5).map((s, i) => ({ id: S.uid(), scene: s.id, min: i === 0 ? 0 : 1, sec: i === 0 ? 30 : 0, trans: "", ov: [], play: [] })); S.save(); U.renderShow(); } })),
    U.check("לחזור להתחלה אחרי השלב האחרון", sh.loop, v => { sh.loop = v; S.save(); }),
    U.field("התחלה אוטומטית בשעה (לא חובה)", h("div", { class: "row" }, h("input", { type: "time", value: sh.startAt, oninput: e => { sh.startAt = e.target.value; S.save(); } }),
      h("button", { class: "btn", id: "pArm", onclick: () => { if (!sh.startAt) { U.toast("בחרו שעה", true); return; } run.armed = !run.armed; U.toast(run.armed ? "התוכנית תתחיל בשעה " + sh.startAt + ". השאירו את הדף פתוח." : "ההפעלה האוטומטית בוטלה"); S.emit("show"); } })),
      "הדף חייב להישאר פתוח עד השעה הזו."),
    h("p", { class: "hint", id: "showTotal" }));
  paintShow();
};
function paintShow() {
  const st = $("#showStatus"); if (!st) return; const steps = S.show.steps, cur = steps[run.idx], d = cur ? dur(cur) : 0, total = steps.reduce((a, s) => a + dur(s), 0);
  st.textContent = run.on ? "שלב " + (run.idx + 1) + " מתוך " + steps.length + ": " + sceneName(cur.scene) + (run.paused ? " (מושהה)" : "") + (d > 0 ? " · נותרו " + fmt(d - elapsed()) : " · ממתין ללחיצה על הבא")
    : run.armed ? "ממתין לשעה " + S.show.startAt : "התוכנית לא פועלת";
  const bar = $("#showBar"); if (bar) bar.style.width = run.on && d > 0 ? Math.min(100, elapsed() / d * 100) + "%" : "0%";
  const b = $("#pStart"); if (b) b.textContent = run.on ? (run.paused ? "▶ המשך" : "⏸ השהיה") : "▶ התחלת התוכנית";
  const a = $("#pArm"); if (a) a.textContent = run.armed ? "⏰ מופעל (לחצו לביטול)" : "⏰ הפעלה בשעה";
  const t = $("#showTotal"); if (t) t.textContent = "סך הכול: " + fmt(total) + (steps.some(s => !dur(s)) ? " ועוד שלבים שממתינים ללחיצה" : "") + ".";
  document.querySelectorAll(".step").forEach(c => c.classList.toggle("live", run.on && +c.dataset.i === run.idx));
}
S.on("show", () => { paintShow(); const c = $("#chipShow"); if (c) { c.hidden = !run.on; if (run.on) c.textContent = "📋 " + (run.idx + 1) + "/" + S.show.steps.length + (run.paused ? " מושהה" : (S.show.steps[run.idx] && dur(S.show.steps[run.idx]) > 0 ? " · " + fmt(dur(S.show.steps[run.idx]) - elapsed()) : "")); } });

/* ---------- לשונית: שלט ושיוך כפתורים ---------- */
function loadQR(cb) { if (window.QRCode) return cb(); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s.onload = cb; document.head.append(s); }
async function phoneCall(payload) {
  const r = await fetch(document.body.dataset.remotePhone, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": document.querySelector('meta[name="csrf-token"]').content }, body: JSON.stringify(payload || {}) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "שגיאה"); return j;
}
async function fillPhone() {
  const box = $("#phoneBox"); if (!box) return; let j;
  try { j = await phoneCall({}); } catch (e) { box.textContent = e.message; return; }
  if (!$("#phoneBox")) return; box.innerHTML = "";
  const pin = h("input", { type: "text", value: j.pin || "", placeholder: "4 עד 8 ספרות", inputmode: "numeric", style: "max-width:160px" });
  box.append(U.field("קוד הכניסה לשלט (מי שיש לו את הקוד והמספר שולט באולפן)", h("div", { class: "row" }, pin,
      h("button", { class: "btn", text: "שמירה", onclick: async () => { try { await phoneCall({ pin: pin.value }); U.toast("הקוד נשמר"); fillPhone(); } catch (e) { U.toast(e.message, true); } } }),
      h("button", { class: "btn", text: "קוד אקראי", onclick: async () => { await phoneCall({ newpin: true }); fillPhone(); } }))),
    j.ext ? h("p", { class: "hint", text: "✓ השלוחה מוגדרת בקו הראשי (שלוחה " + j.ext + "), והיא מוקראת בתפריט הראשי של הקו." })
      : h("button", { class: "btn go", text: "➕ הוספת שלוחת שלט לקו", onclick: async e => { e.currentTarget.disabled = true; try { const r = await phoneCall({ setup: true }); if (r.error) U.toast(r.error, true); else U.toast("השלוחה נוספה לקו"); } catch (er) { U.toast(er.message, true); } fillPhone(); } }),
    h("p", { class: "hint", text: "אם הקוד לא מוגדר, או השלוחה לא נוספה, השלט בטלפון לא יענה." }));
}
U.renderRemote = function () {
  if (U.tab !== "remote") return; const body = $("#tabBody"), st = S.settings; body.innerHTML = "";
  const online = !!document.body.dataset.remoteSync, base = online ? document.body.dataset.remoteSync.replace(/sync\/$/, "") : "", link = S.remote.token ? location.origin + base + S.remote.token + "/" : "";
  if (!online) body.append(h("p", { class: "hint", text: "שלט הטלפון והשלט בטלפון כשר זמינים באולפן שבאתר (בדפדפן), לא בתוכנה העצמאית. שלט מצגות, נאמפד, עכבר, MIDI ובקר משחק עובדים גם כאן." }));
  else body.append(h("h3", { text: "📱 שלט מהטלפון" }), h("p", { class: "hint", text: "פותחים בטלפון דף עם כפתורים גדולים: מחליפים סצנות, שכבות והתוכנית האוטומטית מכל מקום, גם כשאתם על הבמה. הטלפון והמחשב צריכים אינטרנט." }),
    U.check("הפעלת השלט מהטלפון", st.remoteOn, v => { st.remoteOn = v; S.save(); S.remote._shown = false; U.renderRemote(); }));
  if (st.remoteOn) {
    if (!link) body.append(h("p", { class: "hint", text: "מכין קישור..." }));
    else {
      const qr = h("div", { class: "qr" }); body.append(h("p", { class: "hint", text: "סרקו את הקוד עם הטלפון, או העתיקו את הקישור:" }), qr,
        h("input", { type: "text", readonly: "", value: link, onclick: e => e.target.select() }),
        h("div", { class: "row" }, h("button", { class: "btn", text: "📋 העתקה", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(link); U.toast("הקישור הועתק"); } }),
          h("button", { class: "btn", text: "🔄 קישור חדש", title: "הקישור הישן יפסיק לעבוד", onclick: () => U.confirm("ליצור קישור חדש? הקישור הקודם יפסיק לעבוד.", () => { S.remote.regen = true; S.remote.token = ""; S.remote._shown = false; U.renderRemote(); }) })),
        h("p", { class: "hint", text: "מי שיש לו את הקישור יכול לשלוט באולפן. אל תשתפו אותו." })); loadQR(() => { qr.innerHTML = ""; new window.QRCode(qr, { text: link, width: 170, height: 170 }); });
    }
  }
  if (online) body.append(h("h3", { text: "☎️ שלט בטלפון רגיל או כשר" }), h("p", { class: "hint", text: "מתקשרים לקו, מקישים את הקוד, ושולטים באולפן במקשים: 1 עד 6 סצנות, 7 שלב בתוכנית, 8 רגע חוזרים, 9 הסצנה הבאה, 0 הקודמת. לא צריך אינטרנט בטלפון, רק קליטה לשיחה. האולפן במחשב כן צריך אינטרנט ושהשלט מופעל." }), h("div", { id: "phoneBox" }));
  if (online) fillPhone();
  body.append(h("h3", { text: "🔢 מקלדת מספרים ועכבר" }), h("p", { class: "hint", text: "מקלדת מספרים (נאמפד) עובדת מיד: 1 עד 9 מעלים סצנה בשידור, + הבאה, מינוס קודמת, Enter שידור, כוכבית חיתוך, 0 רגע חוזרים, סלאש שלב בתוכנית. עכבר: לחצו על הכפתור הרצוי ושייכו אותו למטה, או השתמשו בהגדרה המהירה." }),
    h("button", { class: "btn", text: "🖱️ הגדרה מהירה: עכבר כשלט", title: "ימני והצדדי הקדמי = הבאה, אמצעי והצדדי האחורי = קודמת", onclick: () => { st.binds = (st.binds || []).filter(b => b.kind !== "mouse"); st.binds.push({ kind: "mouse", code: "m2", action: "next" }, { kind: "mouse", code: "m4", action: "next" }, { kind: "mouse", code: "m1", action: "prev" }, { kind: "mouse", code: "m3", action: "prev" }); S.save(); U.toast("העכבר הוגדר: ימני = הבאה, אמצעי = קודמת"); U.renderRemote(); } }),
    h("p", { class: "hint", text: "הכפתור השמאלי של העכבר נשאר לעבודה רגילה." }),
    h("h3", { text: "🎹 שלט מצגות, מקלדת, פדל ו-MIDI" }), h("p", { class: "hint", text: "שלט מצגות (קליקר) עובד מיד: הכפתור הבא או הקודם מחליפים סצנה. אפשר גם לשייך מקשים, פדל, מקלדת MIDI או בקר משחק לכל פעולה. המקשים עובדים כשהדף של האולפן בחזית." }),
    U.check("הפעלת MIDI", st.midi, async v => { st.midi = v; S.save(); if (v) await U.midiInit(); }, "מקלדות, משטחי כפתורים ופדלים שמחוברים ב-USB. הדפדפן יבקש הרשאה."),
    U.check("הפעלת בקר משחק", st.pad, v => { st.pad = v; S.save(); }, "מחוברים ב-USB או בלוטות'. לחצו עליו פעם אחת כדי שהדפדפן יזהה אותו."));
  let chosen = ACTS()[0][0]; const rows = h("div", { id: "binds" });
  const paint = () => { rows.innerHTML = ""; (st.binds || []).forEach((b, i) => rows.append(h("div", { class: "rc" }, h("div", { class: "meta" }, h("b", { text: actName(b.action) }), h("small", { text: { key: "מקש ", midi: "MIDI ", pad: "בקר ", mouse: "כפתור עכבר " }[b.kind] + b.code })), h("button", { class: "mini", text: "🗑", onclick: () => { st.binds.splice(i, 1); S.save(); paint(); } })))); if (!(st.binds || []).length) rows.append(h("p", { class: "empty", text: "עוד אין שיוכים." })); };
  body.append(h("h3", { text: "שיוך כפתורים" }), U.field("פעולה", U.sel(ACTS(), chosen, v => (chosen = v))),
    h("button", { class: "btn go", text: "🎯 שיוך: לחצו על הכפתור", onclick: () => U.learn((kind, code) => { st.binds = st.binds || []; st.binds = st.binds.filter(b => !(b.kind === kind && b.code === code)); st.binds.push({ kind, code, action: chosen }); S.save(); U.toast("נשמר"); paint(); }) }), rows);
  paint();
};
S.on("scenes", () => { if (U.tab === "show" && !document.activeElement.closest("#steps")) { /* לא מרעננים בזמן הקלדה */ } });
})();
