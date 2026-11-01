/* אולפן הקלטות (studio/templates/studio/music.html): ערוצי שמע, הקלטה על מנגינה, מנגנייה, הורדת שירה ומיקס.
   הכול רץ בדפדפן (Web Audio) - השמע לא עולה לשרת. השרת רק מכין שיר מיוטיוב (library:yt_prepare). */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const root = $("mz");
  if (!root) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  const SR = 44100;
  const MAX_SECONDS = 20 * 60; // תקרה לשיר אחד, כדי לא למלא את זיכרון המחשב

  let ctx = null;
  let masterIn = null;
  const tracks = [];
  let nextId = 1;
  let recCount = 0;
  let playing = null; // {nodes, when, from}
  let pos = 0;
  let rec = null;
  let preview = null;

  const status = (text) => { $("mzStatus").textContent = text || ""; };
  const fmt = (s) => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
  const num = (el, dflt = 0) => { const v = parseFloat(el.value); return Number.isFinite(v) ? v : dflt; };

  function chain(c) {
    // מגביל עדין בסוף: כשכמה ערוצים חזקים מתנגנים יחד, השיר לא "נשרף"
    const g = c.createGain();
    g.gain.value = num($("mzMaster"), 1);
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 3; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
    g.connect(lim); lim.connect(c.destination);
    return g;
  }

  function audio() {
    if (!AC) { status("הדפדפן הזה לא תומך באולפן. נסו Chrome או Edge."); throw new Error("no audio"); }
    if (!ctx) { ctx = new AC({ latencyHint: "interactive" }); masterIn = chain(ctx); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const impulses = new WeakMap();
  function impulse(c) {
    if (impulses.has(c)) return impulses.get(c);
    const len = Math.floor(c.sampleRate * 2.2);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    impulses.set(c, b);
    return b;
  }

  const len = (t) => Math.max(0, t.buf.duration - t.trimS - t.trimE);
  const songEnd = () => tracks.reduce((m, t) => Math.max(m, t.start + len(t)), 0);
  const total = () => Math.max(30, songEnd() + 2);
  const bpm = () => Math.min(220, Math.max(40, num($("bmBpm"), 100)));

  // ---------- ניגון ----------
  function schedule(c, out, from, when) {
    const nodes = [];
    const anySolo = tracks.some((t) => t.solo);
    let verb = null;
    for (const t of tracks) {
      const L = len(t);
      if (t.mute || (anySolo && !t.solo) || L <= 0 || t.start + L <= from) continue;
      const src = c.createBufferSource();
      src.buffer = t.buf;
      const g = c.createGain();
      fxChain(c, t, src, nodes).connect(g);
      let last = g;
      if (t.chorus > 0) { // מקהלה: עותק מושהה מעט, שהשהייתו "מתנדנדת"
        const d = c.createDelay(0.1); d.delayTime.value = 0.025;
        const lfo = c.createOscillator(); lfo.frequency.value = 1.3;
        const depth = c.createGain(); depth.gain.value = 0.006;
        lfo.connect(depth); depth.connect(d.delayTime); lfo.start(when);
        const wet = c.createGain(); wet.gain.value = t.chorus * 0.8;
        g.connect(d); d.connect(wet); wet.connect(out);
        nodes.push(lfo);
      }
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = t.pan; g.connect(p); last = p; }
      last.connect(out);
      if (t.reverb > 0) {
        if (!verb) { verb = c.createConvolver(); verb.buffer = impulse(c); verb.connect(out); }
        const s = c.createGain(); s.gain.value = t.reverb; last.connect(s); s.connect(verb);
      }
      if (t.echo > 0) {
        const d = c.createDelay(2); d.delayTime.value = Math.min(1.5, 60 / bpm() * 0.75);
        const fb = c.createGain(); fb.gain.value = 0.35;
        const s = c.createGain(); s.gain.value = t.echo;
        last.connect(s); s.connect(d); d.connect(fb); fb.connect(d); d.connect(out);
      }
      const offs = Math.max(0, from - t.start);
      const at = when + Math.max(0, t.start - from);
      const zero = at - offs; // הרגע שבו תחילת הערוץ "הייתה" מתנגנת
      const v = (x) => t.vol * (t.fadeIn > 0 ? Math.min(1, x / t.fadeIn) : 1) * (t.fadeOut > 0 ? Math.min(1, (L - x) / t.fadeOut) : 1);
      const gv = g.gain;
      gv.setValueAtTime(v(offs), at);
      if (t.fadeIn > offs) gv.linearRampToValueAtTime(t.vol, zero + Math.min(t.fadeIn, L));
      if (t.fadeOut > 0) {
        const fs = Math.max(offs, t.fadeIn, L - t.fadeOut);
        gv.setValueAtTime(v(fs), zero + fs);
        gv.linearRampToValueAtTime(0, zero + L);
      }
      src.start(at, t.trimS + offs, L - offs);
      nodes.push(src);
    }
    return nodes;
  }

  // אפקטים לערוץ: אקולייזר (בס/אמצע/גבוהים), פילטר, עיוות, טרמולו וקומפרסור. מוסיפים רק מה שבשימוש.
  const FILTERS = { 1: [400, 3000, 0], 2: [600, 2600, 6], 3: [0, 650, 0], 4: [900, 0, 0] }; // טלפון, רדיו ישן, רחוק, דק
  const curves = {};
  function curve(amount) {
    const key = amount.toFixed(2);
    if (curves[key]) return curves[key];
    const k = 1 + amount * 25, n = 2048, cv = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; cv[i] = Math.tanh(k * x) / norm; }
    return (curves[key] = cv);
  }
  function fxChain(c, t, src, nodes) {
    let last = src;
    const add = (node) => { last.connect(node); last = node; return node; };
    const biquad = (type, f, gain, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (gain !== undefined) b.gain.value = gain; if (q) b.Q.value = q; return add(b); };
    if (t.eqLow) biquad("lowshelf", 150, t.eqLow);
    if (t.eqMid) biquad("peaking", 1500, t.eqMid, 0.8);
    if (t.eqHigh) biquad("highshelf", 6000, t.eqHigh);
    const flt = FILTERS[t.filter];
    if (t.filter === 5) { // זמזום חשמל: 50 הרץ והכפולות שלו, ורעש נמוך
      biquad("highpass", 60, undefined, 0.7);
      for (const f of [50, 100, 150, 200]) biquad("notch", f, undefined, 30);
    }
    if (flt) {
      if (flt[0]) biquad("highpass", flt[0], undefined, 0.9);
      if (flt[1]) biquad("lowpass", flt[1], undefined, 0.9);
      if (flt[2]) biquad("peaking", 1200, flt[2], 1);
    }
    if (t.drive > 0) {
      const ws = c.createWaveShaper(); ws.curve = curve(t.drive); ws.oversample = "2x";
      add(ws);
      const back = c.createGain(); back.gain.value = 1 / (1 + t.drive * 1.5); add(back);
    }
    if (t.tremolo > 0) {
      const tg = c.createGain(); tg.gain.value = 1 - t.tremolo / 2;
      const lfo = c.createOscillator(); lfo.frequency.value = 5;
      const depth = c.createGain(); depth.gain.value = t.tremolo / 2;
      lfo.connect(depth); depth.connect(tg.gain); lfo.start(0);
      add(tg); nodes.push(lfo);
    }
    if (t.comp > 0) {
      const cp = c.createDynamicsCompressor();
      cp.threshold.value = -t.comp * 40; cp.ratio.value = 2 + t.comp * 10; cp.knee.value = 6;
      cp.attack.value = 0.005; cp.release.value = 0.2;
      add(cp);
      const makeup = c.createGain(); makeup.gain.value = Math.pow(10, (t.comp * 14) / 20); add(makeup);
    }
    return last;
  }

  // הגדרות מוכנות: לוחצים, ואפשר לכוונן אחר כך בעצמכם
  const FX_KEYS = ["eqLow", "eqMid", "eqHigh", "filter", "drive", "tremolo", "comp", "chorus", "reverb", "echo"];
  const FX_PRESETS = {
    clean: {},
    warm: { eqLow: 3, eqMid: -1, eqHigh: 2, comp: 0.45, reverb: 0.2 },
    hall: { eqHigh: 2, comp: 0.4, reverb: 0.6, echo: 0.12 },
    choir: { chorus: 0.7, reverb: 0.35, comp: 0.3 },
    radio: { filter: 2, comp: 0.7, drive: 0.15 },
    phone: { filter: 1, comp: 0.5 },
    far: { filter: 3, reverb: 0.4 },
    guitar: { drive: 0.6, eqMid: 3, comp: 0.3 },
    bright: { eqLow: -2, eqHigh: 5, comp: 0.35 },
    bass: { eqLow: 6, eqHigh: -2 },
  };

  function click(c, out, t, strong) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square"; o.frequency.value = strong ? 1600 : 1000;
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.05);
    return o;
  }

  function clicks(c, out, from, when, until) {
    const beat = 60 / bpm();
    const nodes = [];
    for (let i = Math.ceil(from / beat - 1e-6); i * beat < until && nodes.length < 2000; i++) {
      nodes.push(click(c, out, when + i * beat - from, i % 4 === 0));
    }
    return nodes;
  }

  const now = () => (playing ? playing.from + Math.max(0, ctx.currentTime - playing.when) : pos);

  function play(from = pos, delay = 0.08) {
    halt();
    const c = audio();
    const when = c.currentTime + delay;
    const nodes = schedule(c, masterIn, from, when);
    if ($("mzClick").checked) nodes.push(...clicks(c, masterIn, from, when, total()));
    playing = { nodes, when, from };
    $("mzPlay").textContent = "⏸ השהיה";
    requestAnimationFrame(tick);
    return when;
  }

  function halt() {
    if (!playing) return;
    pos = now();
    for (const n of playing.nodes) { try { n.stop(); } catch (e) { /* כבר נעצר */ } }
    playing = null;
    $("mzPlay").textContent = "▶ ניגון";
  }

  // התצוגה: איזה קטע מהשיר רואים ברוחב הגלים (בהגדלה רואים רק חלק, וגוללים)
  let zoom = 1, viewStart = 0;
  function view() {
    const T = total(), vlen = T / zoom;
    return { v0: Math.min(Math.max(0, viewStart), Math.max(0, T - vlen)), vlen };
  }
  function setZoom(z, center) {
    const T = total();
    zoom = Math.min(64, Math.max(1, z));
    viewStart = center - T / zoom / 2;
    redraw();
  }

  function updateHead() {
    const p = now();
    $("mzTime").textContent = fmt(p);
    const seek = $("mzSeek");
    seek.max = total().toFixed(1);
    if (document.activeElement !== seek) seek.value = p;
    let { v0, vlen } = view();
    if (playing && zoom > 1 && (p < v0 || p > v0 + vlen)) { viewStart = p - vlen * 0.05; redraw(); return; } // הסמן יצא מהתצוגה - גוללים אחריו
    const sc = $("mzScroll");
    sc.hidden = zoom === 1;
    sc.max = Math.max(0, total() - vlen).toFixed(2);
    if (document.activeElement !== sc) sc.value = v0;
    const x = (p - v0) / vlen;
    const hasMarks = markA !== null && markB !== null;
    const ra = hasMarks ? Math.max(0, (markA - v0) / vlen) : 0, rb = hasMarks ? Math.min(1, (markB - v0) / vlen) : 0;
    for (const t of tracks) {
      t.line.style.left = `${x * 100}%`; t.line.hidden = x < 0 || x > 1;
      t.region.hidden = !hasMarks || rb <= ra;
      if (hasMarks) { t.region.style.left = `${ra * 100}%`; t.region.style.width = `${(rb - ra) * 100}%`; }
    }
    showLyric(p);
    if (playing && !rec && hasMarks && $("mzLoop").checked && p >= markB) { play(markA); return; } // חזרה על הקטע לתרגול
    if (playing && !rec && p > songEnd() + 0.5) { halt(); pos = 0; updateHead(); }
  }
  let rafOn = false;
  function loop() { updateHead(); if (playing) requestAnimationFrame(loop); else rafOn = false; }
  function tick() {
    updateHead();
    if (playing && !rafOn) { rafOn = true; requestAnimationFrame(loop); }
  }

  // ---------- ערוצים ----------
  function addTrack(buf, name, extra = {}) {
    if (buf.duration > MAX_SECONDS) { status(`הקובץ ארוך מדי (עד ${MAX_SECONDS / 60} דקות).`); return null; }
    const t = { id: nextId++, name, buf, start: 0, vol: 1, pan: 0, mute: false, solo: false, reverb: 0, echo: 0,
      fadeIn: 0, fadeOut: 0, trimS: 0, trimE: 0, bufId: newId(),
      eqLow: 0, eqMid: 0, eqHigh: 0, filter: 0, drive: 0, tremolo: 0, comp: 0, chorus: 0, ...extra };
    t.el = buildTrack(t);
    tracks.push(t);
    $("mzTracks").appendChild(t.el);
    $("mzEmpty").hidden = true;
    redraw();
    touch();
    return t;
  }

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const TRACK_HTML = `
    <div class="mz-head">
      <input class="mz-name" aria-label="שם הערוץ">
      <button type="button" class="btn btn-secondary" data-a="mute">🔇 השתקה</button>
      <button type="button" class="btn btn-secondary" data-a="solo">🎧 סולו</button>
      <button type="button" class="btn btn-secondary" data-a="del">🗑 מחיקה</button>
    </div>
    <div class="mz-wavebox" dir="ltr"><canvas class="mz-wave"></canvas><span class="mz-region" hidden></span><span class="mz-line"></span></div>
    <div class="mz-ctl">
      <label>עוצמה <input type="range" data-k="vol" min="0" max="2" step="0.01"></label>
      <label>ימין/שמאל <input type="range" data-k="pan" min="-1" max="1" step="0.05"></label>
      <label>הד <input type="range" data-k="reverb" min="0" max="1" step="0.01"></label>
      <label>אקו <input type="range" data-k="echo" min="0" max="1" step="0.01"></label>
      <label>מתחיל בשנייה <input type="number" data-k="start" min="0" step="0.01"></label>
      <label>חיתוך בהתחלה <input type="number" data-k="trimS" min="0" step="0.1"></label>
      <label>חיתוך בסוף <input type="number" data-k="trimE" min="0" step="0.1"></label>
      <label>כניסה הדרגתית <input type="number" data-k="fadeIn" min="0" step="0.5"></label>
      <label>יציאה הדרגתית <input type="number" data-k="fadeOut" min="0" step="0.5"></label>
    </div>
    <details class="mz-fx">
      <summary>🎛️ אפקטים</summary>
      <div class="mz-ctl">
        <label>הגדרה מוכנה <select class="mz-preset">
          <option value="">בחירה...</option><option value="warm">שירה חמה</option><option value="hall">חזן באולם</option>
          <option value="choir">מקהלה</option><option value="radio">רדיו ישן</option><option value="phone">קול טלפון</option>
          <option value="far">קול רחוק</option><option value="guitar">עיוות (גיטרה חשמלית)</option><option value="bright">צלול ובהיר</option>
          <option value="bass">בס חזק</option><option value="clean">בלי אפקטים</option></select></label>
        <label>נמוכים <input type="range" data-k="eqLow" min="-12" max="12" step="1"></label>
        <label>אמצע <input type="range" data-k="eqMid" min="-12" max="12" step="1"></label>
        <label>גבוהים <input type="range" data-k="eqHigh" min="-12" max="12" step="1"></label>
        <label>קומפרסור <input type="range" data-k="comp" min="0" max="1" step="0.05"></label>
        <label>מקהלה <input type="range" data-k="chorus" min="0" max="1" step="0.05"></label>
        <label>עיוות <input type="range" data-k="drive" min="0" max="1" step="0.05"></label>
        <label>רטט <input type="range" data-k="tremolo" min="0" max="1" step="0.05"></label>
        <label>פילטר <select data-k="filter"><option value="0">בלי</option><option value="1">טלפון</option>
          <option value="2">רדיו ישן</option><option value="3">רחוק / מתחת למים</option><option value="4">דק</option><option value="5">בלי זמזום חשמל</option></select></label>
      </div>
    </details>
    <div class="mz-tools">
      <button type="button" class="btn btn-secondary" data-a="novocal">🎤✂ הורדת השירה</button>
      <button type="button" class="btn btn-secondary" data-a="vocal">🎤 שירה בלבד</button>
      <button type="button" class="btn btn-secondary" data-a="denoise">🧹 ניקוי רעשים</button>
      <button type="button" class="btn btn-secondary" data-a="split">✂ חיתוך במקום הסמן</button>
      <label class="mz-inline">סולם השיר <select class="mz-key"><option value="-1">כל הצלילים</option>${NOTE_NAMES
        .map((n, i) => `<option value="${i}">${n} מז'ור / ${NOTE_NAMES[(i + 9) % 12]} מינור</option>`).join("")}</select></label>
      <label class="mz-inline">עוצמת תיקון <select class="mz-tune"><option value="0.5">עדין</option><option value="0.8" selected>בינוני</option>
        <option value="1">מלא (רובוטי)</option></select></label>
      <button type="button" class="btn btn-secondary" data-a="tune">🎯 תיקון זיופים</button>
      <button type="button" class="btn btn-secondary" data-a="norm">📈 הגברה לרמה מלאה</button>
      <label class="mz-inline">סולם <select data-k="semi">${[-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]
        .map((n) => `<option value="${n}">${n > 0 ? "+" : ""}${n}</option>`).join("")}</select></label>
      <label class="mz-inline"><input type="checkbox" class="mz-keep" checked> בלי לשנות מהירות</label>
      <button type="button" class="btn btn-secondary" data-a="pitch">🎚 שינוי סולם</button>
      <label class="mz-inline">מהירות <select class="mz-tempo">${[70, 75, 80, 85, 90, 95, 105, 110, 115, 120, 125, 130]
        .map((n) => `<option value="${n}"${n === 90 ? " selected" : ""}>${n}%</option>`).join("")}</select></label>
      <button type="button" class="btn btn-secondary" data-a="tempo">⏩ שינוי מהירות</button>
      <button type="button" class="btn btn-secondary" data-a="dup">⧉ שכפול</button>
      <button type="button" class="btn btn-secondary" data-a="dl">⬇️ הורדת הערוץ</button>
    </div>`;

  function buildTrack(t) {
    const el = document.createElement("div");
    el.className = "mz-track";
    el.innerHTML = TRACK_HTML;
    const name = el.querySelector(".mz-name");
    name.value = t.name;
    name.addEventListener("input", () => { t.name = name.value; });
    el.querySelectorAll("[data-k]").forEach((inp) => {
      if (inp.dataset.k === "semi") { inp.value = "-2"; return; }
      inp.value = t[inp.dataset.k];
      inp.addEventListener("input", () => {
        t[inp.dataset.k] = Math.max(inp.min === "" ? -Infinity : +inp.min, num(inp));
        if (/start|trim/.test(inp.dataset.k)) {
          t.trimS = Math.min(t.trimS, t.buf.duration);
          t.trimE = Math.min(t.trimE, t.buf.duration - t.trimS);
          redraw();
        }
        if (playing) play(now());
      });
    });
    el.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => action(t, b.dataset.a)));
    tips(el);
    const preset = el.querySelector(".mz-preset");
    preset.addEventListener("change", () => {
      const p = FX_PRESETS[preset.value];
      if (!p) return;
      for (const k of FX_KEYS) t[k] = p[k] || 0;
      preset.value = "";
      sync(t);
      if (playing) play(now());
      touch();
    });
    t.canvas = el.querySelector("canvas");
    t.line = el.querySelector(".mz-line");
    t.region = el.querySelector(".mz-region");
    dragWave(t);
    return el;
  }

  function sync(t) {
    t.el.classList.toggle("muted", t.mute);
    t.el.querySelector('[data-a="mute"]').classList.toggle("btn-secondary", !t.mute);
    t.el.querySelector('[data-a="solo"]').classList.toggle("btn-secondary", !t.solo);
    t.el.querySelectorAll("[data-k]").forEach((inp) => { if (inp.dataset.k !== "semi" && document.activeElement !== inp) inp.value = t[inp.dataset.k]; });
  }

  async function action(t, a) {
    if (a === "mute" || a === "solo") { t[a] = !t[a]; sync(t); if (playing) play(now()); return; }
    if (a === "del") {
      if (!confirm(`למחוק את הערוץ "${t.name}"?`)) return;
      tracks.splice(tracks.indexOf(t), 1); t.el.remove(); touch();
      $("mzEmpty").hidden = tracks.length > 0;
      if (playing) play(now());
      redraw(); return;
    }
    if (a === "dl") { save(wav(t.buf), `${t.name || "ערוץ"}.wav`); return; }
    if (a === "dup") { addTrack(t.buf, `${t.name} (עותק)`, { vol: t.vol, pan: t.pan, start: t.start, trimS: t.trimS, trimE: t.trimE }); return; }
    status("מעבד...");
    try {
      if (a === "novocal" || a === "vocal") {
        const vocal = a === "vocal";
        const buf = await separate(t.buf, vocal ? "vocal" : "inst");
        if (!buf) return;
        t.mute = true; sync(t);
        addTrack(buf, `${t.name} - ${vocal ? "שירה" : "מנגינה"}`, { start: t.start, trimS: t.trimS, trimE: t.trimE });
        status(vocal ? "נוצר ערוץ של השירה בלבד (הערוץ המקורי הושתק). נשארים בו גם קצת כלים שמנוגנים באמצע."
          : "נוצר ערוץ חדש בלי השירה (הערוץ המקורי הושתק). אם עדיין שומעים שירה - השיר כנראה לא הוקלט כך שאפשר להוריד אותה.");
      } else if (a === "split") {
        const p = playing ? now() : pos, cut = p - t.start;
        if (cut <= 0.05 || cut >= len(t) - 0.05) { status("הסמן לא נמצא בתוך הערוץ הזה. מזיזים את הסמן (לחיצה על הגל) למקום החיתוך."); return; }
        const extra = {};
        for (const k of TRACK_KEYS) if (k !== "name") extra[k] = t[k];
        Object.assign(extra, { start: p, trimS: t.trimS + cut, fadeIn: 0 });
        t.trimE = t.buf.duration - (t.trimS + cut); t.fadeOut = 0;
        const nt = addTrack(t.buf, `${t.name} (המשך)`, extra);
        t.el.after(nt.el);
        tracks.splice(tracks.indexOf(nt), 1); tracks.splice(tracks.indexOf(t) + 1, 0, nt);
        redraw(); touch();
        status("הערוץ נחתך לשניים. כדי למחוק קטע: חותכים בתחילתו ובסופו, ומוחקים את החלק שבאמצע.");
      } else if (a === "tune") {
        const key = +t.el.querySelector(".mz-key").value, amount = +t.el.querySelector(".mz-tune").value;
        const buf = await autotune(t.buf, key, amount);
        t.mute = true; sync(t);
        addTrack(buf, `${t.name} - מתוקן`, { start: t.start, trimS: t.trimS, trimE: t.trimE, vol: t.vol, pan: t.pan });
        status("נוצר ערוץ עם תיקון זיופים (הערוץ המקורי הושתק). אם יוצא רובוטי מדי - בוחרים \"עדין\", ואם הסולם ידוע - בוחרים אותו.");
      } else if (a === "denoise") {
        const buf = await denoise(t.buf);
        t.mute = true; sync(t);
        addTrack(buf, `${t.name} - נקי`, { start: t.start, trimS: t.trimS, trimE: t.trimE, vol: t.vol, pan: t.pan });
        status("נוצר ערוץ נקי מרעשי רקע (הערוץ המקורי הושתק). אם הקול נשמע \"מתכתי\" - לחצו שוב על המקורי בעוצמה נמוכה יותר, או השתמשו במקורי.");
      } else if (a === "norm") {
        t.buf = normalize(t.buf); t.bufId = newId(); redraw(); touch(); status("העוצמה הוגברה לרמה המלאה.");
      } else if (a === "pitch") {
        const semi = +t.el.querySelector('[data-k="semi"]').value;
        const rate = Math.pow(2, semi / 12);
        const keep = t.el.querySelector(".mz-keep").checked;
        await pause();
        const buf = await resample(keep ? stretch(t.buf, rate) : t.buf, rate);
        addTrack(buf, `${t.name} (${semi > 0 ? "+" : ""}${semi})`, { start: t.start });
        t.mute = true; sync(t);
        status(keep ? "נוצר ערוץ בסולם החדש, באותה מהירות (הערוץ המקורי הושתק)."
          : "נוצר ערוץ בסולם החדש (הערוץ המקורי הושתק). שימו לב: גם המהירות השתנתה.");
      } else if (a === "tempo") {
        const pct = +t.el.querySelector(".mz-tempo").value;
        await pause();
        addTrack(stretch(t.buf, 100 / pct), `${t.name} (${pct}%)`, { start: t.start });
        t.mute = true; sync(t);
        status("נוצר ערוץ במהירות החדשה, באותו סולם (הערוץ המקורי הושתק).");
      }
    } catch (e) {
      status(`לא הצלחתי: ${e.message || e}`);
    }
  }

  function redraw() {
    const { v0, vlen } = view();
    for (const t of tracks) {
      sync(t);
      const cv = t.canvas;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.floor(cv.clientWidth * dpr));
      const H = Math.max(1, Math.floor(cv.clientHeight * dpr));
      cv.width = W; cv.height = H;
      const g = cv.getContext("2d");
      g.clearRect(0, 0, W, H);
      const L = len(t);
      const xa = Math.max(0, Math.floor(((t.start - v0) / vlen) * W));
      const xb = Math.min(W, Math.ceil(((t.start + L - v0) / vlen) * W));
      if (xb <= xa) continue;
      g.fillStyle = "rgba(37,99,235,.15)";
      g.fillRect(xa, 0, xb - xa, H);
      g.fillStyle = "#2563eb";
      const d = t.buf.getChannelData(0);
      const sr = t.buf.sampleRate;
      const s0 = Math.floor(t.trimS * sr), sEnd = Math.min(d.length, s0 + Math.floor(L * sr));
      const perCol = (vlen / W) * sr;
      const stride = Math.max(1, Math.floor(perCol / 200));
      for (let x = xa; x < xb; x++) {
        let mx = 0;
        const a = s0 + Math.floor((v0 + (x / W) * vlen - t.start) * sr);
        const b = Math.min(sEnd, a + Math.ceil(perCol));
        for (let i = Math.max(s0, a); i < b; i += stride) { const v = Math.abs(d[i]); if (v > mx) mx = v; }
        const h = Math.max(1, mx * H);
        g.fillRect(x, (H - h) / 2, 1, h);
      }
    }
    updateHead();
  }

  function dragWave(t) {
    const cv = t.canvas;
    let start = null;
    cv.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, s: t.start, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      if (Math.abs(dx) < 4 && !start.moved) return;
      start.moved = true;
      t.start = Math.max(0, +(start.s + (dx / cv.clientWidth) * view().vlen).toFixed(2));
      redraw();
    });
    cv.addEventListener("pointerup", (e) => {
      if (start && !start.moved) {
        const r = cv.getBoundingClientRect();
        const { v0, vlen } = view();
        seekTo(v0 + ((e.clientX - r.left) / r.width) * vlen);
      } else { if (playing) play(now()); touch(); }
      start = null;
    });
    // Ctrl + גלגלת העכבר: הגדלה והקטנה סביב המקום של העכבר
    cv.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect(), { v0, vlen } = view();
      setZoom(zoom * (e.deltaY < 0 ? 1.5 : 1 / 1.5), v0 + ((e.clientX - r.left) / r.width) * vlen);
    }, { passive: false });
  }

  function seekTo(p) {
    pos = Math.max(0, p);
    if (playing) play(pos); else tick();
  }

  // ---------- עיבוד ----------
  // הפרדה לפי תדרים: השירה כמעט תמיד "באמצע" - זהה בשני הצדדים. בכל רגע ובכל תדר בודקים כמה הצד הימני והשמאלי
  // דומים; מה שדומה (בתחום התדרים של קול אדם) הוא השירה. "מנגינה" = השיר פחות החלק הזה (נשאר בסטריאו), "שירה בלבד" = החלק הזה.
  async function separate(b, mode) {
    if (b.numberOfChannels < 2) { status("השיר הזה במונו (ערוץ אחד) - אי אפשר להפריד ממנו את השירה."); return null; }
    const l = b.getChannelData(0), r = b.getChannelData(1);
    let side = 0, mid = 0;
    for (let i = 0; i < l.length; i += 64) { side += Math.abs(l[i] - r[i]); mid += Math.abs(l[i] + r[i]); }
    if (side < mid * 0.01) { status("שני הצדדים של השיר זהים (מונו) - אי אפשר להפריד ממנו את השירה."); return null; }
    const N = 4096, hop = N / 4, half = N / 2, len = b.length, sr = b.sampleRate;
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const mask = new Float64Array(half + 1);
    const lo = Math.round((140 * N) / sr), hi = Math.round((9000 * N) / sr);
    const outL = new Float32Array(len), outR = new Float32Array(len);
    const lr = new Float64Array(N), li = new Float64Array(N), rr = new Float64Array(N), ri = new Float64Array(N);
    const cr = new Float64Array(N), ci = new Float64Array(N);
    const frames = Math.ceil((len + N) / hop);
    for (let f = 0; f < frames; f++) {
      const st = f * hop - N;
      for (let i = 0; i < N; i++) {
        const j = st + i;
        const ok = j >= 0 && j < len;
        lr[i] = ok ? l[j] * win[i] : 0; rr[i] = ok ? r[j] * win[i] : 0; li[i] = 0; ri[i] = 0;
      }
      fft(lr, li, false); fft(rr, ri, false);
      for (let k = 0; k <= half; k++) {
        let m = 0;
        if (k >= lo && k <= hi) {
          const pl = lr[k] * lr[k] + li[k] * li[k], pr = rr[k] * rr[k] + ri[k] * ri[k];
          const sim = (2 * (lr[k] * rr[k] + li[k] * ri[k])) / (pl + pr + 1e-12); // 1 = זהה בשני הצדדים
          m = Math.min(1, Math.max(0, (sim - 0.55) / 0.35));
          m = m * m * (3 - 2 * m);
          // קצוות התחום נכנסים בהדרגה, כדי שלא יישמע "חור" בתדרים
          m *= Math.min(1, (k - lo) / 6 + 0.2, (hi - k) / 40 + 0.2);
        }
        mask[k] = m;
      }
      for (let k = 0; k < N; k++) {
        const kk = k <= half ? k : N - k;
        const m = mask[kk];
        cr[k] = ((lr[k] + rr[k]) / 2) * m; ci[k] = ((li[k] + ri[k]) / 2) * m;
      }
      if (mode === "vocal") {
        fft(cr, ci, true);
        for (let i = 0; i < N; i++) { const j = st + i; if (j >= 0 && j < len) { const v = cr[i] * win[i]; outL[j] += v; outR[j] += v; } }
      } else {
        for (let k = 0; k < N; k++) { lr[k] -= cr[k]; li[k] -= ci[k]; rr[k] -= cr[k]; ri[k] -= ci[k]; }
        fft(lr, li, true); fft(rr, ri, true);
        for (let i = 0; i < N; i++) { const j = st + i; if (j >= 0 && j < len) { outL[j] += lr[i] * win[i]; outR[j] += rr[i] * win[i]; } }
      }
      if (f % 200 === 0) { status(`מפריד את השירה... ${Math.round((f / frames) * 100)}%`); await pause(); }
    }
    const g = 1 / 1.5; // חלונות חופפים ברבע: סכום ריבועי החלונות הוא 1.5
    const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
    for (let i = 0; i < len; i++) { outL[i] *= g; outR[i] *= g; }
    out.copyToChannel(outL, 0); out.copyToChannel(outR, 1);
    return out;
  }

  // ניקוי רעשים: לומדים את "טביעת" הרעש מהרגעים השקטים ביותר (רחש, מזגן, מאוורר), ומחלישים בכל תדר
  // רק את מה שלא חזק ממנו בבירור. ההחלשה מוחלקת בזמן, כדי שלא יישמעו "בועות".
  // תיקון זיופים: מזהים את גובה הקול בכל רגע (שיטת YIN), מחשבים כמה הוא רחוק מהתו הקרוב בסולם,
  // ומזיזים את הקול לשם בגרגרים קטנים חופפים - כך האורך לא משתנה. בקטעים בלי צליל ברור (עיצורים, נשימות) לא נוגעים.
  async function autotune(b, key, amount) {
    const sr = b.sampleRate, C = b.numberOfChannels, len = b.length;
    const D = 4, H = 512, W = 384, dsr = sr / D;
    const minLag = Math.floor(dsr / 1000), maxLag = Math.ceil(dsr / 70);
    const ins = [];
    for (let c = 0; c < C; c++) ins.push(b.getChannelData(c));
    const dl = Math.floor(len / D);
    const x = new Float32Array(dl);
    for (let i = 0; i < dl; i++) { let v = 0; for (let k = 0; k < D; k++) for (let c = 0; c < C; c++) v += ins[c][i * D + k]; x[i] = v / (D * C); }
    const allowed = key < 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 2, 4, 5, 7, 9, 11].map((n) => (n + key) % 12);
    const frames = Math.ceil(len / H) + 1;
    const ratio = new Float64Array(frames).fill(1);
    const d = new Float64Array(maxLag + 1);
    let prevLog = 0;
    for (let f = 0; f < frames; f++) {
      const st = Math.floor((f * H) / D) - W / 2;
      let r = 1;
      if (st >= 0 && st + W + maxLag < dl) {
        let energy = 0;
        for (let i = 0; i < W; i++) energy += x[st + i] * x[st + i];
        if (energy / W > 1e-5) {
          let sum = 0, tau = -1;
          d[0] = 1;
          for (let lag = 1; lag <= maxLag; lag++) {
            let v = 0;
            for (let i = 0; i < W; i++) { const q = x[st + i] - x[st + i + lag]; v += q * q; }
            sum += v;
            d[lag] = sum ? (v * lag) / sum : 1;
          }
          for (let lag = minLag; lag < maxLag; lag++) {
            if (d[lag] < 0.15) { while (lag + 1 < maxLag && d[lag + 1] < d[lag]) lag++; tau = lag; break; }
          }
          if (tau > 0) {
            const a0 = d[tau - 1], a1 = d[tau], a2 = d[tau + 1] || a1;
            const den = a0 - 2 * a1 + a2;
            const t2 = tau + (den ? (0.5 * (a0 - a2)) / den : 0);
            const midi = 69 + 12 * Math.log2(dsr / t2 / 440);
            let best = Math.round(midi), bestDist = 99;
            for (let m = Math.floor(midi) - 2; m <= Math.ceil(midi) + 2; m++) {
              if (allowed.includes(((m % 12) + 12) % 12) && Math.abs(m - midi) < bestDist) { bestDist = Math.abs(m - midi); best = m; }
            }
            r = Math.pow(2, ((best - midi) * amount) / 12);
          }
        }
      }
      const lg = Math.log(r);
      prevLog = r === 1 ? prevLog * 0.5 : prevLog * 0.5 + lg * 0.5; // מעבר חלק בין תווים
      ratio[f] = Math.exp(prevLog);
      if (f % 400 === 0) { status(`מתקן זיופים... ${Math.round((f / frames) * 50)}%`); await pause(); }
    }
    // כל גרגר מנוגן במהירות המתוקנת, ומוזז מעט (עד 6 אלפיות שנייה) כך שימשיך בדיוק את הגל שכבר נכתב - אחרת הגרגרים
    // החופפים מבטלים זה את זה והגובה לא משתנה
    const N = 2048, Hs = H, tol = 256, win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const outs = [], norm = new Float32Array(len + N);
    for (let c = 0; c < C; c++) outs.push(new Float32Array(len + N));
    const read = (src, pos) => { const p0 = Math.floor(pos), fr = pos - p0; return p0 >= 0 && p0 + 1 < len ? src[p0] * (1 - fr) + src[p0 + 1] * fr : 0; };
    const ref = ins[0], acc0 = outs[0], ov = N - Hs;
    for (let f = 0; f < frames; f++) {
      const o = f * Hs - N / 2, r = ratio[f];
      let best = 0;
      if (f > 0) {
        let bestC = -Infinity;
        for (let dd = -tol; dd <= tol; dd += 4) {
          let corr = 0;
          for (let i = 0; i < ov; i += 8) { const j = o + i; if (j >= 0) corr += acc0[j] * read(ref, f * Hs + dd + (i - N / 2) * r); }
          if (corr > bestC) { bestC = corr; best = dd; }
        }
      }
      const center = f * Hs + best;
      for (let c = 0; c < C; c++) {
        const src = ins[c], out = outs[c];
        for (let i = 0; i < N; i++) { const j = o + i; if (j >= 0 && j < len) out[j] += read(src, center + (i - N / 2) * r) * win[i]; }
      }
      for (let i = 0; i < N; i++) { const j = o + i; if (j >= 0 && j < len) norm[j] += win[i]; }
      if (f % 200 === 0) { status(`מתקן זיופים... ${50 + Math.round((f / frames) * 50)}%`); await pause(); }
    }
    for (const out of outs) for (let i = 0; i < len; i++) out[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
    const out = new AudioBuffer({ length: len, numberOfChannels: C, sampleRate: sr });
    outs.forEach((o, c) => out.copyToChannel(o.subarray(0, len), c));
    return out;
  }

  async function denoise(b) {
    const N = 2048, hop = N / 4, half = N / 2, len = b.length, C = b.numberOfChannels;
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const ins = [];
    for (let c = 0; c < C; c++) ins.push(b.getChannelData(c));
    const frames = Math.ceil((len + N) / hop);
    const re = new Float64Array(N), im = new Float64Array(N);
    const load = (c, st) => { for (let i = 0; i < N; i++) { const j = st + i; re[i] = j >= 0 && j < len ? ins[c][j] * win[i] : 0; im[i] = 0; } };
    // שלב 1: עוצמה של כל רגע, ובחירת עשרת האחוזים השקטים (שאינם שקט מוחלט)
    const energy = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
      const st = f * hop - N;
      let e = 0;
      for (let i = 0; i < N; i += 4) { const j = st + i; if (j >= 0 && j < len) e += ins[0][j] * ins[0][j]; }
      energy[f] = e;
    }
    const sorted = [...energy].filter((e) => e > 1e-9).sort((x, y) => x - y);
    const limit = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
    const noise = new Float64Array(half + 1);
    let count = 0;
    for (let f = 0; f < frames && count < 300; f++) {
      if (energy[f] > limit || energy[f] <= 1e-9) continue;
      load(0, f * hop - N); fft(re, im, false);
      for (let k = 0; k <= half; k++) noise[k] += Math.hypot(re[k], im[k]);
      count++;
    }
    if (!count) return b;
    for (let k = 0; k <= half; k++) noise[k] = (noise[k] / count) * 1.8;
    // שלב 2: החלשה לפי התדר
    const out = [];
    for (let c = 0; c < C; c++) out.push(new Float32Array(len));
    const gain = new Float64Array(half + 1).fill(1), mag = new Float64Array(half + 1);
    const res = [], ims = [];
    for (let c = 0; c < C; c++) { res.push(new Float64Array(N)); ims.push(new Float64Array(N)); }
    for (let f = 0; f < frames; f++) {
      const st = f * hop - N;
      mag.fill(0);
      for (let c = 0; c < C; c++) {
        load(c, st); fft(re, im, false);
        res[c].set(re); ims[c].set(im);
        for (let k = 0; k <= half; k++) mag[k] += Math.hypot(re[k], im[k]) / C;
      }
      for (let k = 0; k <= half; k++) {
        const g = Math.max(0.08, 1 - noise[k] / (mag[k] + 1e-12));
        gain[k] = g > gain[k] ? g : gain[k] * 0.6 + g * 0.4; // עולה מיד (שלא ייחתכו מילים), יורד בהדרגה
      }
      for (let c = 0; c < C; c++) {
        const r = res[c], i2 = ims[c];
        for (let k = 0; k < N; k++) { const g = gain[k <= half ? k : N - k]; r[k] *= g; i2[k] *= g; }
        fft(r, i2, true);
        const o = out[c];
        for (let i = 0; i < N; i++) { const j = st + i; if (j >= 0 && j < len) o[j] += (r[i] * win[i]) / 1.5; }
      }
      if (f % 200 === 0) { status(`מנקה רעשים... ${Math.round((f / frames) * 100)}%`); await pause(); }
    }
    const buf = new AudioBuffer({ length: len, numberOfChannels: C, sampleRate: b.sampleRate });
    out.forEach((d, c) => buf.copyToChannel(d, c));
    return buf;
  }

  // התמרת פורייה מהירה (בסיס 2), במקום
  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const ang = ((inverse ? 2 : -2) * Math.PI) / size;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let s0 = 0; s0 < n; s0 += size) {
        let cr0 = 1, ci0 = 0;
        for (let k = 0; k < size / 2; k++) {
          const a = s0 + k, b2 = a + size / 2;
          const xr = re[b2] * cr0 - im[b2] * ci0, xi = re[b2] * ci0 + im[b2] * cr0;
          re[b2] = re[a] - xr; im[b2] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr0 * wr - ci0 * wi; ci0 = cr0 * wi + ci0 * wr; cr0 = t;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  function normalize(b) {
    let peak = 0;
    for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) { const a = Math.abs(v); if (a > peak) peak = a; }
    if (peak < 1e-4) return b;
    const k = 0.95 / peak;
    const out = new AudioBuffer({ length: b.length, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) {
      const src = b.getChannelData(c), dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i++) dst[i] = src[i] * k;
    }
    return out;
  }

  const pause = () => new Promise((ok) => setTimeout(ok, 30)); // שהודעת "מעבד..." תופיע לפני חישוב ארוך

  // מתיחת זמן (WSOLA): משנה את האורך בלי לשנות את הגובה. כל חלון נבחר כך שימשיך בצורה חלקה את הקודם.
  function stretch(b, factor) {
    const N = 2048, Hs = 512, Ha = Hs / factor, tol = 256;
    const inLen = b.length, outLen = Math.ceil(inLen * factor), C = b.numberOfChannels;
    const out = new AudioBuffer({ length: Math.max(1, outLen), numberOfChannels: C, sampleRate: b.sampleRate });
    if (inLen < N * 2) { for (let c = 0; c < C; c++) out.getChannelData(c).set(b.getChannelData(c).subarray(0, outLen)); return out; }
    const ins = [], acc = [];
    for (let c = 0; c < C; c++) { ins.push(b.getChannelData(c)); acc.push(new Float32Array(outLen + N)); }
    const norm = new Float32Array(outLen + N);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const ref = ins[0];
    let prev = 0;
    for (let k = 0; k * Hs < outLen; k++) {
      const nominal = Math.min(inLen - N, Math.round(k * Ha));
      let best = nominal;
      const target = prev + Hs;
      if (k > 0 && target + N / 2 < inLen) {
        let bestC = -Infinity;
        for (let d = -tol; d <= tol; d += 4) {
          const q = nominal + d;
          if (q < 0 || q + N > inLen) continue;
          let corr = 0;
          for (let i = 0; i < N / 2; i += 8) corr += ref[target + i] * ref[q + i];
          if (corr > bestC) { bestC = corr; best = q; }
        }
      }
      best = Math.max(0, best);
      const o = k * Hs;
      for (let c = 0; c < C; c++) { const src = ins[c], dst = acc[c]; for (let i = 0; i < N; i++) dst[o + i] += src[best + i] * win[i]; }
      for (let i = 0; i < N; i++) norm[o + i] += win[i];
      prev = best;
    }
    for (let c = 0; c < C; c++) {
      const dst = out.getChannelData(c), a = acc[c];
      for (let i = 0; i < outLen; i++) dst[i] = norm[i] > 1e-3 ? a[i] / norm[i] : 0;
    }
    return out;
  }

  function resample(b, rate) {
    const oc = new OfflineAudioContext(b.numberOfChannels, Math.ceil(b.length / rate), b.sampleRate);
    const s = oc.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    s.connect(oc.destination); s.start();
    return oc.startRendering();
  }

  // ---------- קבצים ----------
  function wav(buf) {
    const ch = Math.min(2, buf.numberOfChannels), n = buf.length, sr = buf.sampleRate;
    const ab = new ArrayBuffer(44 + n * ch * 2);
    const v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVE"); w(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, n * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, data[c][i]));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }

  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/[\\/:*?"<>|]+/g, "_");
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  async function decode(data) {
    return audio().decodeAudioData(data);
  }

  $("mzFile").addEventListener("change", async (e) => {
    for (const f of [...e.target.files]) {
      status(`טוען את ${f.name}...`);
      try {
        addTrack(await decode(await f.arrayBuffer()), f.name.replace(/\.[^.]+$/, ""));
        status("");
      } catch (err) {
        status(`לא הצלחתי לפתוח את ${f.name} - זה לא קובץ שמע או וידאו נתמך.`);
      }
    }
    e.target.value = "";
  });

  function ytId(url) {
    const m = /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/.exec(url) || /^([\w-]{11})$/.exec(url.trim());
    return m ? m[1] : "";
  }

  if ($("mzYtGo")) $("mzYtGo").addEventListener("click", async () => {
    const id = ytId($("mzYt").value);
    if (!id) { status("זה לא נראה כמו קישור ליוטיוב."); return; }
    const base = root.dataset.ytPrepare.replace("VIDEOID", id);
    const btn = $("mzYtGo");
    btn.disabled = true;
    try {
      for (let i = 0; i < 90; i++) {
        status("מכין את השיר מיוטיוב (לפעמים לוקח דקה)...");
        const r = await fetch(`${base}?kind=audio`, { credentials: "same-origin" });
        const data = await r.json().catch(() => ({}));
        if (data.state === "ready") {
          status("מוריד את השיר...");
          const file = await fetch(data.url, { credentials: "same-origin" });
          if (!file.ok) throw new Error("ההורדה נכשלה");
          addTrack(await decode(await file.arrayBuffer()), `יוטיוב ${id}`);
          status("השיר נוסף. כדי לקבל רק את המנגינה לוחצים בערוץ שלו \"🎤✂ הורדת השירה\".");
          $("mzYt").value = "";
          return;
        }
        if (data.state === "failed" || !r.ok) throw new Error(data.error || "השרת לא הצליח להכין את השיר");
        await new Promise((ok) => setTimeout(ok, 3000));
      }
      throw new Error("זה לוקח יותר מדי זמן. נסו שוב בעוד כמה דקות");
    } catch (e) {
      status(`יוטיוב: ${e.message || e}`);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- הקלטה ----------
  let workletReady = null;
  // ---------- מיקרופון: מד עוצמה ושמיעה עצמית ----------
  let micAn = null, micMon = null, micSrc = null, micTest = null, meterPeak = 0;
  function attachMic(c, stream) {
    micSrc = c.createMediaStreamSource(stream);
    micAn = c.createAnalyser(); micAn.fftSize = 1024;
    micSrc.connect(micAn);
    // שמיעה עצמית: הקול חוזר לאוזניות, עם קצת הד כדי שיהיה נעים לשיר
    micMon = c.createGain(); micMon.gain.value = $("mzMonitor").checked ? 1 : 0;
    const verb = c.createConvolver(); verb.buffer = impulse(c);
    const send = c.createGain(); send.gain.value = 0.2;
    micSrc.connect(micMon); micMon.connect(masterIn); micMon.connect(send); send.connect(verb); verb.connect(masterIn);
    $("mzMeterBox").hidden = false;
    requestAnimationFrame(meter);
    return micSrc;
  }
  function detachMic() {
    if (micSrc) micSrc.disconnect();
    if (micMon) micMon.disconnect();
    micSrc = micAn = micMon = null;
    $("mzMeterBox").hidden = true;
  }
  const meterData = new Float32Array(1024);
  function meter() {
    if (!micAn) return;
    micAn.getFloatTimeDomainData(meterData);
    let pk = 0;
    for (const v of meterData) { const a = Math.abs(v); if (a > pk) pk = a; }
    meterPeak = Math.max(pk, meterPeak * 0.92);
    const bar = $("mzMeterBar"), label = $("mzMeterText");
    bar.style.width = `${Math.min(100, meterPeak * 100)}%`;
    const [color, text] = meterPeak > 0.95 ? ["#dc2626", "חזק מדי - התרחקו קצת מהמיקרופון"] : meterPeak < 0.06 ? ["#9ca3af", "חלש - קרבו את המיקרופון או שירו חזק יותר"] : ["#16a34a", "עוצמה טובה"];
    bar.style.background = color;
    label.textContent = text;
    requestAnimationFrame(meter);
  }
  function stopMicTest() {
    if (!micTest) return;
    detachMic();
    micTest.getTracks().forEach((tr) => tr.stop());
    micTest = null;
    $("mzMicTest").textContent = "🎤 בדיקת מיקרופון";
  }
  $("mzMicTest").addEventListener("click", async () => {
    if (micTest) { stopMicTest(); status(""); return; }
    if (rec) return;
    const c = audio();
    try {
      micTest = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      status("אין גישה למיקרופון. מאשרים בחלון של הדפדפן (ליד שורת הכתובת) ומנסים שוב.");
      return;
    }
    attachMic(c, micTest);
    $("mzMicTest").textContent = "⏹ סיום בדיקה";
    status("שירו או דברו כרגיל, ובדקו שהפס ירוק. עם \"לשמוע את עצמי\" שומעים את הקול באוזניות.");
  });
  $("mzMonitor").addEventListener("change", () => {
    if (micMon) micMon.gain.value = $("mzMonitor").checked ? 1 : 0;
    if ($("mzMonitor").checked) status("לשמוע את עצמי: רק עם אוזניות! עם רמקולים תהיה שריקה.");
  });

  // ---------- מילות השיר ----------
  // כל שורה מקבלת זמן ("תזמון"): מנגנים ולוחצים "השורה הבאה" (או רווח) בדיוק כשהשורה מתחילה. בלי תזמון - לפי מקום בשיר.
  let lyrTimes = [], lyrTiming = false;
  const lyrLines = () => $("mzLyrics").value.split("\n").map((l) => l.trim()).filter(Boolean);
  function showLyric(p) {
    const lines = lyrLines(), box = $("mzLyrBox");
    box.hidden = !lines.length;
    if (!lines.length) return;
    let i;
    if (lyrTimes.length) { i = -1; lyrTimes.forEach((t, k) => { if (t <= p + 0.05) i = k; }); }
    else i = songEnd() ? Math.min(lines.length - 1, Math.floor((p / songEnd()) * lines.length)) : 0;
    $("mzLyrNow").textContent = i >= 0 ? lines[i] || "" : "♪";
    $("mzLyrNext").textContent = lines[i + 1] || "";
  }
  function lyrStamp() {
    const lines = lyrLines();
    if (lyrTimes.length >= lines.length) { lyrTiming = false; $("mzLyrTime").textContent = "⏱ תזמון השורות"; status("כל השורות תוזמנו."); touch(); return; }
    lyrTimes.push(+now().toFixed(2));
    status(`שורה ${lyrTimes.length} מתוך ${lines.length} תוזמנה. לחצו שוב (או רווח) כשהשורה הבאה מתחילה.`);
    updateHead();
    if (lyrTimes.length >= lines.length) lyrStamp();
  }
  $("mzLyrTime").addEventListener("click", () => {
    if (lyrTiming) { lyrTiming = false; $("mzLyrTime").textContent = "⏱ תזמון השורות"; halt(); touch(); return; }
    if (!lyrLines().length) { status("קודם כותבים או מדביקים את מילות השיר."); return; }
    lyrTimes = []; lyrTiming = true;
    $("mzLyrTime").textContent = "⏹ סיום תזמון";
    play(pos);
    status("מנגן. לחצו \"↵ השורה הבאה\" (או רווח) בדיוק כשכל שורה מתחילה.");
  });
  $("mzLyrStep").addEventListener("click", () => { if (lyrTiming) lyrStamp(); else status("קודם לוחצים \"⏱ תזמון השורות\"."); });
  $("mzLyrClear").addEventListener("click", () => { lyrTimes = []; updateHead(); touch(); status("התזמון נמחק. השורות יוצגו לפי המקום בשיר."); });
  document.addEventListener("keydown", (e) => {
    if (lyrTiming && e.key === " " && !e.target.matches("input, textarea, select")) { e.preventDefault(); lyrStamp(); }
  });

  // ---------- קטע: סימון, חזרה בלופ והקלטה חוזרת של הקטע בלבד ----------
  let markA = null, markB = null;
  function showMarks() {
    const ok = markA !== null && markB !== null;
    $("mzRange").textContent = ok ? `קטע: ${fmt(markA)} - ${fmt(markB)}` : markA !== null ? `מתחיל ב-${fmt(markA)}` : "";
    $("mzPunch").disabled = !ok;
  }
  function setMark(which) {
    const p = playing ? now() : pos;
    if (which === "a") { markA = p; if (markB !== null && markB <= p) markB = null; }
    else { markB = p; if (markA === null || markA >= p) markA = Math.max(0, p - 4); }
    showMarks(); updateHead(); touch();
  }
  $("mzMarkA").addEventListener("click", () => setMark("a"));
  $("mzMarkB").addEventListener("click", () => setMark("b"));
  $("mzMarkClear").addEventListener("click", () => { markA = markB = null; showMarks(); updateHead(); touch(); });
  $("mzPunch").addEventListener("click", () => { if (!rec) startRec(true).catch((e) => status(`ההקלטה נכשלה: ${e.message || e}`)); });

  async function startRec(punch = false) {
    const c = audio();
    if (!navigator.mediaDevices || !c.audioWorklet) { status("הדפדפן הזה לא יכול להקליט כאן. נסו Chrome או Edge."); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      status("אין גישה למיקרופון. מאשרים בחלון של הדפדפן (ליד שורת הכתובת) ומנסים שוב.");
      return;
    }
    workletReady = workletReady || c.audioWorklet.addModule(root.dataset.worklet);
    await workletReady;
    const from = punch ? Math.max(0, markA - 2) : playing ? now() : pos; // בקטע: מתחילים שתי שניות לפני, כדי להיכנס לקצב
    halt();
    stopMicTest();
    const node = new AudioWorkletNode(c, "mz-rec");
    const src = attachMic(c, stream);
    const sink = c.createGain(); sink.gain.value = 0;
    src.connect(node); node.connect(sink); sink.connect(c.destination);
    const chunks = [];
    let done;
    const finished = new Promise((ok) => { done = ok; });
    node.port.onmessage = (e) => { if (e.data.done) done(); else chunks.push(e.data); };
    const beat = 60 / bpm();
    const count = $("mzCount").checked ? 4 * beat : 0;
    const when = c.currentTime + 0.15 + count;
    if (count) for (let i = 0; i < 4; i++) click(c, masterIn, when - count + i * beat, i === 0);
    play(from, when - c.currentTime);
    rec = { node, stream, src, sink, chunks, finished, when, from, punch };
    if (punch) { const r0 = rec; setTimeout(() => { if (rec === r0) stopRec(); }, (when - c.currentTime + (markB - from) + 0.4) * 1000); }
    $("mzRec").classList.add("on");
    $("mzRec").textContent = "⏹ סיום הקלטה";
    status(count ? "סופרים 4 פעימות... ואז שרים." : "מקליט...");
    if (count) setTimeout(() => { if (rec) status("מקליט..."); }, count * 1000 + 150);
  }

  async function stopRec() {
    const r = rec;
    rec = null;
    halt();
    $("mzRec").classList.remove("on");
    $("mzRec").textContent = "⏺ הקלטה";
    r.node.port.postMessage("stop");
    await Promise.race([r.finished, new Promise((ok) => setTimeout(ok, 1500))]);
    detachMic();
    r.src.disconnect(); r.node.disconnect(); r.sink.disconnect();
    r.stream.getTracks().forEach((tr) => tr.stop());
    if (!r.chunks.length) { status("לא נקלט קול מהמיקרופון."); return; }
    const c = ctx;
    const f0 = r.chunks[0].f;
    const n = r.chunks.reduce((s, ch) => s + ch.l.length, 0);
    // הקול שומעים באיחור (רמקול/אוזניות) ונקלט באיחור (מיקרופון): מזיזים את ההקלטה אחורה בהתאם
    const lat = (c.outputLatency || c.baseLatency || 0) + num($("mzLatency")) / 1000;
    const skip = Math.round((r.when + lat) * c.sampleRate) - f0;
    const stereo = r.chunks.every((ch) => ch.r);
    const length = n - Math.max(0, skip);
    if (length < c.sampleRate * 0.2) { status("ההקלטה קצרה מדי."); return; }
    const buf = c.createBuffer(stereo ? 2 : 1, length, c.sampleRate);
    for (let k = 0; k < (stereo ? 2 : 1); k++) {
      const all = new Float32Array(n);
      let o = 0;
      for (const ch of r.chunks) { const part = k ? ch.r : ch.l; all.set(part, o); o += part.length; }
      buf.getChannelData(k).set(all.subarray(Math.max(0, skip)));
    }
    const recStart = r.from + Math.max(0, -skip) / c.sampleRate;
    if (r.punch && markA !== null && markB !== null) {
      const trimS = Math.max(0, markA - recStart), trimE = Math.max(0, recStart + buf.duration - markB);
      if (buf.duration - trimS - trimE > 0.05) {
        addTrack(buf, `הקלטה ${++recCount} (קטע)`, { start: +(recStart + trimS).toFixed(3), trimS: +trimS.toFixed(3), trimE: +trimE.toFixed(3), fadeIn: 0.03, fadeOut: 0.03 });
        status("הקטע הוקלט כערוץ חדש. בערוץ הישן חותכים את אותו קטע (✂) ומוחקים אותו, או משתיקים את הישן.");
        return;
      }
    }
    addTrack(buf, `הקלטה ${++recCount}`, { start: recStart });
    status("ההקלטה נוספה כערוץ חדש.");
  }

  $("mzRec").addEventListener("click", () => (rec ? stopRec() : startRec()).catch((e) => status(`ההקלטה נכשלה: ${e.message || e}`)));
  $("mzPlay").addEventListener("click", () => { if (rec) return; if (playing) halt(); else play(pos); tick(); });
  $("mzStop").addEventListener("click", () => { if (rec) { stopRec(); return; } if (!playing) pos = 0; halt(); tick(); });
  $("mzSeek").addEventListener("input", (e) => { if (!rec) seekTo(+e.target.value); });
  $("mzZoomIn").addEventListener("click", () => setZoom(zoom * 2, now()));
  $("mzZoomOut").addEventListener("click", () => setZoom(zoom / 2, now()));
  $("mzScroll").addEventListener("input", (e) => { viewStart = +e.target.value; redraw(); });
  $("mzMaster").addEventListener("input", () => { if (masterIn) masterIn.gain.value = num($("mzMaster"), 1); });

  async function exportSong(kind) {
    const end = songEnd();
    if (!end) { status("אין מה לייצא - עדיין אין ערוצים."); return; }
    status("מחבר את כל הערוצים לשיר אחד...");
    try {
      const oc = new OfflineAudioContext(2, Math.ceil((end + 0.5) * SR), SR);
      schedule(oc, chain(oc), 0, 0);
      const buf = await oc.startRendering();
      const name = ($("mzProjName").value.trim() || "השיר שלי");
      if (kind === "mp3") { status("מכין קובץ MP3..."); await pause(); save(await mp3(buf), `${name}.mp3`); }
      else save(wav(buf), `${name}.wav`);
      status("השיר נשמר במחשב (בתיקיית ההורדות).");
    } catch (e) {
      status(`הייצוא נכשל: ${e.message || e}`);
    }
  }
  async function mixMp3() {
    const end = songEnd();
    if (!end) throw new Error("אין מה לשלוח - עדיין אין ערוצים");
    const oc = new OfflineAudioContext(2, Math.ceil((end + 0.5) * SR), SR);
    schedule(oc, chain(oc), 0, 0);
    const buf = await oc.startRendering();
    status("מכין קובץ MP3..."); await pause();
    return mp3(buf);
  }
  const csrf = () => (document.querySelector('meta[name="csrf-token"]') || {}).content || "";
  if ($("mzDrive")) $("mzDrive").addEventListener("click", async () => {
    const btn = $("mzDrive");
    btn.disabled = true;
    try {
      status("מחבר את השיר...");
      const f = await mixMp3(), name = `${$("mzProjName").value.trim() || "השיר שלי"}.mp3`, H = { "X-CSRFToken": csrf() };
      let res = await fetch(root.dataset.driveStart, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ name, type: "audio/mpeg" }) });
      let js = await res.json();
      if (!res.ok) throw new Error(js.error || "ההעלאה לא נפתחה");
      const CH = 8 * 1024 * 1024;
      for (let off = 0; off < f.size; off += CH) {
        status(`מעלה לדרייב... ${Math.round((off / f.size) * 100)}%`);
        res = await fetch(`${root.dataset.driveChunk}?sid=${js.sid}&start=${off}&total=${f.size}`, { method: "POST", headers: H, body: f.slice(off, off + CH) });
        js = { ...js, ...(await res.json()) };
        if (!res.ok) throw new Error(js.error || "ההעלאה נכשלה");
      }
      status(`✔ השיר נשמר בגוגל דרייב: ${js.name || name}`);
    } catch (e) {
      status(`דרייב: ${e.message || e}`);
    } finally {
      btn.disabled = false;
    }
  });
  if ($("mzLine")) $("mzLine").addEventListener("click", async () => {
    const path = $("mzLinePath").value.trim();
    if (!/^[0-9]+(\/[0-9]+)*$/.test(path)) { status("כותבים מספר שלוחה, למשל 5 או 1/2."); return; }
    const btn = $("mzLine");
    btn.disabled = true;
    try {
      status("מחבר את השיר...");
      const f = await mixMp3();
      const fd = new FormData();
      fd.append("path", path);
      fd.append("file", f, `${$("mzProjName").value.trim() || "song"}.mp3`);
      status("מעלה לקו הטלפון...");
      const res = await fetch(root.dataset.toLine, { method: "POST", headers: { "X-CSRFToken": csrf() }, body: fd });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js.error || "ההעלאה נכשלה");
      status(`✔ השיר עלה לשלוחה ${path} (קובץ ${js.name}). מתקשרים לקו ושומעים אותו שם.`);
      touch();
    } catch (e) {
      status(`קו הטלפון: ${e.message || e}`);
    } finally {
      btn.disabled = false;
    }
  });
  // ---------- הקלטה דרך הטלפון ----------
  const phExt = () => $("mzPhExt").value.trim();
  async function phoneList() {
    const ext = phExt();
    if (!/^[0-9]+(\/[0-9]+)*$/.test(ext)) { status("כותבים את מספר שלוחת ההקלטות (או יוצרים אחת)."); return; }
    status("קורא את ההקלטות מהקו...");
    const res = await fetch(`${root.dataset.phoneList}?path=${encodeURIComponent(ext)}`, { credentials: "same-origin" });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) { status(`הטלפון: ${js.error || "לא הצלחתי לקרוא"}`); return; }
    const box = $("mzPhList");
    box.innerHTML = "";
    if (!js.files.length) { status("אין עדיין הקלטות בשלוחה. מתקשרים, מקישים את השלוחה ושרים."); return; }
    for (const f of js.files) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-secondary";
      b.textContent = `➕ ${f.when || f.name}${f.duration ? ` (${f.duration})` : ""}`;
      b.title = "מוסיף את ההקלטה הזו כערוץ";
      b.addEventListener("click", async () => {
        b.disabled = true;
        status("מוריד את ההקלטה...");
        try {
          const r = await fetch(`${root.dataset.phoneGet}?path=${encodeURIComponent(ext)}&name=${encodeURIComponent(f.name)}`, { credentials: "same-origin" });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "ההורדה נכשלה");
          addTrack(await decode(await r.arrayBuffer()), `טלפון ${f.when || f.name}`, { start: playing ? now() : pos });
          status("ההקלטה מהטלפון נוספה כערוץ (במקום הסמן). אפשר להזיז אותה בגרירה.");
        } catch (e) {
          status(`הטלפון: ${e.message || e}`);
          b.disabled = false;
        }
      });
      box.appendChild(b);
    }
    status(`נמצאו ${js.files.length} הקלטות. לוחצים על הקלטה כדי להוסיף אותה.`);
  }
  if ($("mzPhLoad")) $("mzPhLoad").addEventListener("click", () => phoneList().catch((e) => status(`הטלפון: ${e.message || e}`)));
  if ($("mzPhMake")) $("mzPhMake").addEventListener("click", async () => {
    const num = phExt() || prompt("איזה מספר לתת לשלוחת ההקלטה? (מספר שעוד לא תפוס בקו, למשל 8)", "8");
    if (!num || !/^[0-9]{1,6}$/.test(num.trim())) { status("מספר שלוחה הוא ספרות בלבד, למשל 8."); return; }
    status("יוצר את השלוחה בקו...");
    const fd = new FormData(); fd.append("number", num.trim());
    const res = await fetch(root.dataset.phoneMake, { method: "POST", headers: { "X-CSRFToken": csrf() }, body: fd });
    const js = await res.json().catch(() => ({}));
    if (!res.ok) { status(`הטלפון: ${js.error || "לא הצלחתי ליצור"}`); return; }
    $("mzPhExt").value = js.path; touch();
    status(`✔ שלוחה ${js.path} מוכנה. מתקשרים לקו, מקישים ${js.path}, שרים אחרי הצפצוף ומנתקים.`);
  });

  // ---------- מילים בבינה מלאכותית ----------
  if ($("mzAiGo")) $("mzAiGo").addEventListener("click", async () => {
    const topic = $("mzAiTopic").value.trim();
    if (!topic) { status("כותבים על מה השיר, ואז לוחצים."); return; }
    if ($("mzLyrics").value.trim() && !confirm("להחליף את המילים שכבר כתובות?")) return;
    const btn = $("mzAiGo");
    btn.disabled = true;
    status("הבינה המלאכותית כותבת מילים... (עד חצי דקה)");
    try {
      const fd = new FormData(); fd.append("topic", topic); fd.append("style", $("mzAiStyle").value);
      const res = await fetch(root.dataset.lyricsAi, { method: "POST", headers: { "X-CSRFToken": csrf() }, body: fd });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js.error || "לא התקבלו מילים");
      $("mzLyrics").value = js.text;
      lyrTimes = []; updateHead(); touch();
      status("✔ המילים מוכנות. אפשר לשנות אותן כרצונכם, ואז לתזמן את השורות.");
    } catch (e) {
      status(`מילים: ${e.message || e}`);
    } finally {
      btn.disabled = false;
    }
  });

  $("mzExport").addEventListener("click", () => exportSong("wav"));
  $("mzExportMp3").addEventListener("click", () => exportSong("mp3"));

  let lame = null;
  function loadLame() {
    lame = lame || new Promise((ok, fail) => {
      const sc = document.createElement("script");
      sc.src = root.dataset.lame;
      sc.onload = () => (window.lamejs ? ok(window.lamejs) : fail(new Error("רכיב ה-MP3 לא נטען")));
      sc.onerror = () => { lame = null; fail(new Error("רכיב ה-MP3 לא נטען")); };
      document.head.appendChild(sc);
    });
    return lame;
  }
  async function mp3(buf) {
    const lj = await loadLame();
    const enc = new lj.Mp3Encoder(2, buf.sampleRate, 192);
    const toI16 = (f) => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
    const l = toI16(buf.getChannelData(0)), r = toI16(buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0));
    const parts = [];
    for (let i = 0; i < l.length; i += 1152) {
      const d = enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152));
      if (d.length) parts.push(d);
    }
    parts.push(enc.flush());
    return new Blob(parts, { type: "audio/mpeg" });
  }

  // ---------- שמירת פרויקט ----------
  // נשמר אוטומטית במחשב הזה (IndexedDB של הדפדפן): הגדרות בכל שינוי, וכל קטע שמע פעם אחת בלבד.
  // "שמירה לקובץ" אורזת את כל הפרויקט לקובץ אחד, כדי להעביר למחשב אחר או לגבות.
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  const TRACK_KEYS = ["name", "start", "vol", "pan", "mute", "solo", "reverb", "echo", "fadeIn", "fadeOut", "trimS", "trimE", "bufId",
    "eqLow", "eqMid", "eqHigh", "filter", "drive", "tremolo", "comp", "chorus"];
  const SETTINGS = ["mzMaster", "mzLatency", "mzClick", "mzCount", "bmBpm", "bmBars", "bmPreset", "bmInst", "bmBass", "bmChords",
    "bmKit", "bmStyle", "bmFill", "mzLyrics", "mzLoop", "mzLinePath", "mzPhExt"];
  let projId = null;
  let savedBufs = new Set();
  let saveTimer = null;
  let loading = false;

  function snapshot() {
    const settings = {};
    for (const id of SETTINGS) { const el = $(id); if (!el) continue; settings[id] = el.type === "checkbox" ? el.checked : el.value; }
    return {
      v: 1, settings, grid, lyrTimes, marks: [markA, markB],
      tracks: tracks.map((t) => {
        const o = {};
        for (const k of TRACK_KEYS) o[k] = t[k];
        o.sr = t.buf.sampleRate; o.ch = t.buf.numberOfChannels; o.len = t.buf.length;
        return o;
      }),
    };
  }

  function applySettings(meta) {
    for (const [id, v] of Object.entries(meta.settings || {})) {
      const el = $(id);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    }
    for (const [key] of DRUMS) if (meta.grid && Array.isArray(meta.grid[key])) grid[key] = meta.grid[key].slice(0, 16).map(Boolean);
    buildGrid();
    lyrTimes = Array.isArray(meta.lyrTimes) ? meta.lyrTimes.filter(Number.isFinite) : [];
    [markA, markB] = Array.isArray(meta.marks) ? meta.marks : [null, null];
    showMarks();
    if (masterIn) masterIn.gain.value = num($("mzMaster"), 1);
  }

  function clearAll() {
    halt();
    for (const t of tracks.splice(0)) t.el.remove();
    $("mzEmpty").hidden = false;
    pos = 0; recCount = 0; zoom = 1; viewStart = 0;
    tick();
  }

  let dbp = null;
  function db() {
    dbp = dbp || new Promise((ok, fail) => {
      const r = indexedDB.open("mz-studio", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("projects", { keyPath: "id" }); r.result.createObjectStore("audio", { keyPath: "key" }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    return dbp;
  }
  const req = (r) => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
  const range = (id) => IDBKeyRange.bound(`${id}:`, `${id}:\uffff`);
  const store = async (name, mode = "readonly") => (await db()).transaction(name, mode).objectStore(name);

  function scheduleSave() {
    clearTimeout(saveTimer);
    $("mzSaved").textContent = "שומר...";
    saveTimer = setTimeout(persist, 1200);
  }
  function touch() {
    if (loading || !projId) return;
    scheduleSave();
    clearTimeout(histTimer);
    histTimer = setTimeout(commitHistory, 500);
  }

  // ביטול פעולה וחזרה: לפני כל שינוי נשמר "צילום" של הפרויקט. השמע עצמו לא מועתק - כל עיבוד יוצר שמע חדש,
  // ולכן הצילום רק מחזיק את השמע הקיים.
  let history = [], future = [], current = null, histTimer = null;
  function state() {
    const bufs = {};
    for (const t of tracks) bufs[t.bufId] = t.buf;
    return { meta: JSON.parse(JSON.stringify(snapshot())), bufs, name: $("mzProjName").value };
  }
  function undoButtons() { $("mzUndo").disabled = !history.length; $("mzRedo").disabled = !future.length; }
  function commitHistory() {
    histTimer = null;
    const s = state();
    if (current && JSON.stringify(current.meta) === JSON.stringify(s.meta) && current.name === s.name) return;
    if (current) { history.push(current); if (history.length > 60) history.shift(); }
    current = s; future = [];
    undoButtons();
  }
  function resetHistory() { clearTimeout(histTimer); histTimer = null; history = []; future = []; current = state(); undoButtons(); }
  function travel(from, to, word) {
    if (rec) return;
    if (histTimer) { clearTimeout(histTimer); commitHistory(); }
    if (!from.length) return;
    const s = from.pop();
    to.push(current);
    current = s;
    restore(s.meta, s.bufs);
    $("mzProjName").value = s.name;
    undoButtons();
    scheduleSave();
    status(word);
  }
  const undo = () => travel(history, future, "↶ בוטלה הפעולה האחרונה.");
  const redo = () => travel(future, history, "↷ הפעולה חזרה.");
  $("mzUndo").addEventListener("click", undo);
  $("mzRedo").addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target.matches("input[type=text], input[type=url], input[type=number], textarea")) return; // בשדה טקסט - הביטול של השדה עצמו
    const k = e.key.toLowerCase();
    if ((k === "z" || k === "ז") && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === "y" || k === "ט" || ((k === "z" || k === "ז") && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  async function persist() {
    try {
      const name = $("mzProjName").value.trim() || "פרויקט בלי שם";
      const d = await db();
      const tx = d.transaction(["projects", "audio"], "readwrite");
      const done = new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); });
      tx.objectStore("projects").put({ id: projId, name, updated: Date.now(), meta: snapshot() });
      const audioStore = tx.objectStore("audio");
      const wanted = new Set(tracks.map((t) => t.bufId));
      const fresh = [];
      for (const t of tracks) {
        if (savedBufs.has(t.bufId)) continue;
        const chans = [];
        for (let c = 0; c < t.buf.numberOfChannels; c++) chans.push(t.buf.getChannelData(c));
        audioStore.put({ key: `${projId}:${t.bufId}`, sr: t.buf.sampleRate, chans });
        fresh.push(t.bufId);
      }
      const keys = await req(audioStore.getAllKeys(range(projId)));
      for (const key of keys) if (!wanted.has(key.slice(projId.length + 1))) audioStore.delete(key);
      await done;
      fresh.forEach((b) => savedBufs.add(b));
      for (const b of [...savedBufs]) if (!wanted.has(b)) savedBufs.delete(b);
      $("mzSaved").textContent = `✔ נשמר במחשב הזה (${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })})`;
      try { localStorage.setItem("mz-project", projId); } catch (e) { /* בלי זיכרון בדפדפן */ }
      listProjects();
    } catch (e) {
      $("mzSaved").textContent = "⚠ השמירה האוטומטית נכשלה (אולי אין מקום בדפדפן). שמרו לקובץ.";
    }
  }

  async function listProjects() {
    try {
      const all = await req((await store("projects")).getAll());
      all.sort((a, b) => b.updated - a.updated);
      const sel = $("mzProjects");
      sel.innerHTML = "";
      for (const p of all) {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = `${p.name} - ${new Date(p.updated).toLocaleDateString("he-IL")}`;
        o.selected = p.id === projId;
        sel.appendChild(o);
      }
      return all;
    } catch (e) {
      return [];
    }
  }

  function bufferFrom(sr, chans, len) {
    const b = new AudioBuffer({ length: Math.max(1, len || chans[0].length), numberOfChannels: chans.length, sampleRate: sr });
    chans.forEach((d, c) => b.copyToChannel(d, c));
    return b;
  }

  function restore(meta, buffers) {
    clearAll();
    loading = true;
    try {
      applySettings(meta);
      for (const tm of meta.tracks || []) {
        const buf = buffers[tm.bufId];
        if (!buf) continue;
        const extra = {};
        for (const k of TRACK_KEYS) if (k !== "name" && tm[k] !== undefined) extra[k] = tm[k];
        addTrack(buf, tm.name || "ערוץ", extra);
        if (/^הקלטה \d+$/.test(tm.name || "")) recCount = Math.max(recCount, +tm.name.split(" ")[1]);
      }
    } finally {
      loading = false;
    }
    redraw();
  }

  async function openProject(id) {
    const p = await req((await store("projects")).get(id));
    if (!p) return false;
    const rows = await req((await store("audio")).getAll(range(id)));
    const buffers = {};
    for (const r of rows) buffers[r.key.slice(id.length + 1)] = bufferFrom(r.sr, r.chans);
    projId = id;
    savedBufs = new Set(Object.keys(buffers));
    $("mzProjName").value = p.name;
    restore(p.meta, buffers);
    $("mzSaved").textContent = "✔ נשמר במחשב הזה";
    try { localStorage.setItem("mz-project", id); } catch (e) { /* בלי זיכרון בדפדפן */ }
    listProjects();
    resetHistory();
    return true;
  }

  function startNew() {
    clearAll();
    projId = newId();
    savedBufs = new Set();
    $("mzProjName").value = "פרויקט חדש";
    $("mzSaved").textContent = "";
    listProjects();
    resetHistory();
  }

  $("mzProjNew").addEventListener("click", () => { startNew(); touch(); status("נפתח פרויקט חדש. הקודם נשמר ברשימת הפרויקטים."); });
  $("mzProjOpen").addEventListener("click", async () => {
    const id = $("mzProjects").value;
    if (!id || id === projId) return;
    status("פותח את הפרויקט...");
    if (await openProject(id).catch(() => false)) status("הפרויקט נפתח."); else status("לא הצלחתי לפתוח את הפרויקט.");
  });
  $("mzProjDel").addEventListener("click", async () => {
    const id = $("mzProjects").value;
    const sel = $("mzProjects").selectedOptions[0];
    if (!id || !confirm(`למחוק לגמרי את הפרויקט "${sel ? sel.textContent : ""}"?`)) return;
    const d = await db();
    const tx = d.transaction(["projects", "audio"], "readwrite");
    tx.objectStore("projects").delete(id);
    tx.objectStore("audio").delete(range(id));
    await new Promise((ok) => { tx.oncomplete = ok; tx.onerror = ok; });
    if (id === projId) startNew();
    listProjects();
    status("הפרויקט נמחק.");
  });

  // קובץ פרויקט: "MZPRJ1" + אורך + הגדרות (JSON) + השמע ב-16 ביט, הכול דחוס
  const MAGIC = "MZPRJ1";
  async function gz(blob, mode) {
    const S = mode === "c" ? window.CompressionStream : window.DecompressionStream;
    if (!S) return blob;
    return new Response(blob.stream().pipeThrough(new S("gzip"))).blob();
  }
  $("mzProjSave").addEventListener("click", async () => {
    if (!tracks.length) { status("אין עדיין מה לשמור."); return; }
    status("אורז את הפרויקט לקובץ...");
    await pause();
    const meta = snapshot();
    meta.name = $("mzProjName").value.trim();
    const parts = [];
    const seen = new Set();
    for (const t of tracks) {
      if (seen.has(t.bufId)) continue;
      seen.add(t.bufId);
      for (let c = 0; c < t.buf.numberOfChannels; c++) {
        const f = t.buf.getChannelData(c), o = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
        parts.push(o);
      }
    }
    meta.order = [...seen];
    const head = new TextEncoder().encode(JSON.stringify(meta));
    const len = new Uint32Array([head.length]);
    const blob = await gz(new Blob([MAGIC, len, head, ...parts]), "c");
    save(blob, `${meta.name || "פרויקט"}.mzproj`);
    status("קובץ הפרויקט נשמר במחשב. פותחים אותו כאן ב\"📥 פתיחה מקובץ\".");
  });
  $("mzProjFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) await importProject(await f.arrayBuffer(), f.name);
  });
  // פתיחת קובץ פרויקט: מהכפתור, או בתוכנה למחשב - בלחיצה כפולה על קובץ ‎.mzproj
  async function importProject(ab, fileName) {
    status("פותח את קובץ הפרויקט...");
    try {
      const b0 = new Uint8Array(ab, 0, 2);
      if (b0[0] === 0x1f && b0[1] === 0x8b) ab = await (await gz(new Blob([ab]), "d")).arrayBuffer();
      if (new TextDecoder().decode(new Uint8Array(ab, 0, 6)) !== MAGIC) throw new Error("זה לא קובץ פרויקט של האולפן");
      const hl = new DataView(ab).getUint32(6, true);
      const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 10, hl)));
      let off = 10 + hl;
      const buffers = {};
      for (const bufId of meta.order || []) {
        const tm = meta.tracks.find((t) => t.bufId === bufId);
        const chans = [];
        for (let c = 0; c < tm.ch; c++) {
          const i16 = new Int16Array(ab.slice(off, off + tm.len * 2));
          off += tm.len * 2;
          const fl = new Float32Array(tm.len);
          for (let i = 0; i < tm.len; i++) fl[i] = i16[i] / 0x8000;
          chans.push(fl);
        }
        buffers[bufId] = bufferFrom(tm.sr, chans, tm.len);
      }
      projId = newId();
      savedBufs = new Set();
      $("mzProjName").value = meta.name || fileName.replace(/\.[^.]+$/, "");
      restore(meta, buffers);
      resetHistory();
      touch();
      status("הפרויקט נפתח ונשמר גם ברשימת הפרויקטים.");
    } catch (err) {
      status(`לא הצלחתי לפתוח: ${err.message || err}`);
    }
  }

  root.addEventListener("input", (e) => { if (!e.target.closest(".mz-tools") && !["mzYt", "mzSeek", "mzScroll"].includes(e.target.id)) touch(); });
  root.addEventListener("change", (e) => { if (e.target.type !== "file" && !e.target.closest(".mz-tools")) touch(); });
  root.addEventListener("click", (e) => { if (e.target.closest("#bmGrid, [data-a='mute'], [data-a='solo']")) touch(); });
  window.addEventListener("beforeunload", (e) => {
    if (saveTimer && $("mzSaved").textContent === "שומר...") { persist(); }
    if (tracks.length && !window.indexedDB) { e.preventDefault(); e.returnValue = ""; }
  });
  window.addEventListener("resize", () => redraw());

  // ---------- מנגנייה ----------
  const DRUMS = [["kick", "תוף גדול"], ["snare", "סנר"], ["hat", "היי-האט"], ["clap", "כפיים"]];
  const PRESETS = {
    pop: { kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], clap: [] },
    rock: { kick: [0, 7, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], clap: [] },
    hasidic: { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], clap: [4, 12] },
    ballad: { kick: [0, 10], snare: [8], hat: [0, 4, 8, 12], clap: [] },
    disco: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], clap: [4, 12] },
    hiphop: { kick: [0, 3, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], clap: [] },
    mizrahi: { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], clap: [3, 10] },
    shuffle: { kick: [0, 8], snare: [4, 12], hat: [0, 3, 4, 7, 8, 11, 12, 15], clap: [] },
    reggae: { kick: [8], snare: [8], hat: [2, 6, 10, 14], clap: [] },
    none: { kick: [], snare: [], hat: [], clap: [] },
  };
  const grid = {};
  function buildGrid() {
    const box = $("bmGrid");
    box.innerHTML = "";
    for (const [key, label] of DRUMS) {
      const s = document.createElement("span"); s.textContent = label; box.appendChild(s);
      grid[key] = grid[key] || new Array(16).fill(false);
      for (let i = 0; i < 16; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", `${label} ${i + 1}`);
        b.classList.toggle("on", grid[key][i]);
        b.addEventListener("click", () => { grid[key][i] = !grid[key][i]; b.classList.toggle("on", grid[key][i]); });
        box.appendChild(b);
      }
    }
  }
  function applyPreset() {
    const p = PRESETS[$("bmPreset").value] || PRESETS.none;
    for (const [key] of DRUMS) { grid[key] = new Array(16).fill(false); for (const i of p[key]) grid[key][i] = true; }
    buildGrid();
  }
  $("bmPreset").addEventListener("change", applyPreset);
  applyPreset();

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseChord(sym) {
    const m = /^([A-Ga-g])([#b]?)([^/]*)/.exec(sym.trim());
    if (!m) return null;
    const rootN = (NOTE[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
    const q = m[3];
    const iv = /^maj7/.test(q) ? [0, 4, 7, 11] : /^m7/.test(q) ? [0, 3, 7, 10] : /^dim/.test(q) ? [0, 3, 6]
      : /^aug/.test(q) ? [0, 4, 8] : /^sus4/.test(q) ? [0, 5, 7] : /^sus2/.test(q) ? [0, 2, 7]
        : /^m/.test(q) ? [0, 3, 7] : /^7/.test(q) ? [0, 4, 7, 10] : [0, 4, 7];
    return { root: rootN, iv };
  }
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  function noiseBuf(c) {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(c, out, t, peak, decay, attack = 0.003) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }
  function noise(c, out, nb, t, type, freq, peak, decay) {
    const s = c.createBufferSource(); s.buffer = nb;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    s.connect(f); f.connect(env(c, out, t, peak, decay)); s.start(t); s.stop(t + decay + 0.05);
  }
  function tone(c, out, type, f, t, dur, peak, attack, filter) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = env(c, out, t, peak, dur, attack);
    if (filter) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filter; o.connect(lp); lp.connect(g); } else o.connect(g);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }
  // ערכות תופים: רגיל, אלקטרוני (תוף גדול ארוך ועמוק), עדין (מברשות, חלש יותר)
  let kit = "std";
  const DRUM = {
    kick: (c, out, nb, t) => {
      const [f0, f1, dec, pk] = kit === "elec" ? [110, 38, 0.8, 1] : kit === "soft" ? [120, 50, 0.3, 0.6] : [140, 45, 0.35, 1];
      const o = c.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
      o.connect(env(c, out, t, pk, dec)); o.start(t); o.stop(t + dec + 0.1);
    },
    snare: (c, out, nb, t) => {
      if (kit === "soft") { noise(c, out, nb, t, "bandpass", 3000, 0.25, 0.25); return; }
      noise(c, out, nb, t, "highpass", kit === "elec" ? 2000 : 1200, 0.5, kit === "elec" ? 0.12 : 0.18);
      tone(c, out, "triangle", kit === "elec" ? 220 : 190, t, 0.1, 0.3, 0.002);
    },
    hat: (c, out, nb, t) => noise(c, out, nb, t, "highpass", kit === "elec" ? 9000 : 7000, kit === "soft" ? 0.1 : 0.2, kit === "elec" ? 0.03 : 0.05),
    clap: (c, out, nb, t) => { for (const d of [0, 0.012, 0.024]) noise(c, out, nb, t + d, "bandpass", 1500, kit === "soft" ? 0.25 : 0.45, d ? 0.03 : 0.16); },
  };

  function renderBeat() {
    const b = bpm();
    const bars = Math.min(64, Math.max(1, Math.round(num($("bmBars"), 8))));
    const beat = 60 / b, step = beat / 4, bar = beat * 4;
    const oc = new OfflineAudioContext(2, Math.ceil((bars * bar + 0.6) * SR), SR);
    const out = oc.createGain(); out.gain.value = 0.7; out.connect(oc.destination);
    const nb = noiseBuf(oc);
    const chords = $("bmChords").value.split(/[\s,|]+/).filter(Boolean).map(parseChord);
    const bad = $("bmChords").value.split(/[\s,|]+/).filter(Boolean).filter((s) => !parseChord(s));
    const inst = $("bmInst").value;
    const hasidic = /hasidic|shuffle/.test($("bmPreset").value);
    const arp = $("bmStyle").value === "arp", fill = $("bmFill").checked;
    kit = $("bmKit").value;
    for (let k = 0; k < bars; k++) {
      const t0 = k * bar;
      const fillBar = fill && k % 4 === 3; // מעבר תופים בסוף כל ארבע תיבות
      for (const [key] of DRUMS) {
        for (let i = 0; i < 16; i++) {
          if (fillBar && i >= 12) continue;
          if (grid[key][i]) DRUM[key](oc, out, nb, t0 + i * step);
        }
      }
      if (fillBar) for (let i = 12; i < 16; i++) DRUM.snare(oc, out, nb, t0 + i * step);
      const ch = chords.length ? chords[k % chords.length] : null;
      if (!ch) continue;
      const notes = ch.iv.map((x) => 57 + ((ch.root + 3) % 12) + x); // סביב לה 220 - טווח נעים
      if (arp && inst !== "none") { // ארפג'יו: צלילי האקורד אחד אחרי השני, בשמיניות
        const seq = [...notes, notes[0] + 12, ...notes.slice(1).reverse()];
        for (let i = 0; i < 8; i++) tone(oc, out, inst === "pad" ? "sawtooth" : "triangle", hz(seq[i % seq.length]), t0 + i * beat / 2, beat * 0.9, 0.12, 0.005, inst === "pad" ? 1600 : 0);
      } else if (inst === "guitar") { // פריטה: מכה כלפי מטה ולמעלה, כל מיתר מעט אחרי הקודם
        for (const [at, dir] of [[0, 1], [1.5, -1], [2, 1], [3, -1]]) {
          const order = dir > 0 ? notes : [...notes].reverse();
          order.forEach((m, j) => tone(oc, out, "sawtooth", hz(m), t0 + at * beat + j * 0.015, beat * 1.2, 0.06, 0.003, 2200));
        }
      } else if (inst === "synth") {
        for (const m of notes) { tone(oc, out, "square", hz(m), t0, bar * 0.9, 0.035, 0.02, 1800); tone(oc, out, "square", hz(m) * 1.006, t0, bar * 0.9, 0.035, 0.02, 1800); }
      } else if (inst === "piano") {
        for (const at of [0, 2]) for (const m of notes) { tone(oc, out, "triangle", hz(m), t0 + at * beat, beat * 2, 0.12, 0.005); tone(oc, out, "sine", hz(m + 12), t0 + at * beat, beat, 0.03, 0.005); }
      } else if (inst === "pad") {
        for (const m of notes) tone(oc, out, "sawtooth", hz(m), t0, bar, 0.05, 0.3, 1400);
      } else if (inst === "organ") {
        for (const m of notes) { tone(oc, out, "sine", hz(m), t0, bar * 0.95, 0.08, 0.02); tone(oc, out, "sine", hz(m + 12), t0, bar * 0.95, 0.04, 0.02); }
      }
      if ($("bmBass").checked) {
        const r = 36 + ch.root;
        const pattern = hasidic ? [[0, r], [1, r + 7], [2, r], [3, r + 7]] : [[0, r], [2, r], [3.5, r]];
        for (const [at, m] of pattern) tone(oc, out, "triangle", hz(m), t0 + at * beat, beat * 0.9, 0.4, 0.005, 900);
      }
    }
    if (bad.length) status(`לא הבנתי את האקורדים: ${bad.join(" ")} (כותבים באותיות לועזיות, למשל Am F C G7).`);
    return oc.startRendering();
  }

  $("bmPreview").addEventListener("click", async () => {
    const c = audio();
    if (preview) { try { preview.stop(); } catch (e) { /* כבר נעצר */ } preview = null; $("bmPreview").textContent = "🔊 השמעה"; return; }
    const buf = await renderBeat();
    preview = c.createBufferSource(); preview.buffer = buf; preview.connect(masterIn); preview.start();
    $("bmPreview").textContent = "⏹ עצירת ההשמעה";
    preview.onended = () => { preview = null; $("bmPreview").textContent = "🔊 השמעה"; };
  });
  $("bmAdd").addEventListener("click", async () => {
    audio();
    status("בונה את המנגנון...");
    const buf = await renderBeat();
    addTrack(buf, `מנגנון ${$("bmChords").value.trim()} (${bpm()})`.trim());
    if (!/לא הבנתי/.test($("mzStatus").textContent)) status("המנגנון נוסף כערוץ. עכשיו אפשר להקליט עליו.");
  });

  // התקנה כתוכנה (מהאתר): הדפדפן מציע, אנחנו מציגים כפתור. הקבצים נשמרים במחשב כדי שייפתח גם בלי אינטרנט.
  let installEv = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEv = e; if ($("mzInstall")) $("mzInstall").hidden = false; });
  if ($("mzInstall")) $("mzInstall").addEventListener("click", () => {
    if (!installEv) return;
    installEv.prompt();
    installEv.userChoice.finally(() => { installEv = null; $("mzInstall").hidden = true; });
  });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && root.dataset.sw) {
    navigator.serviceWorker.register(root.dataset.sw, { scope: root.dataset.swScope }).catch(() => {});
  }

  // ---------- הסברים ומדריך ----------
  // הסבר קצר שמופיע כשמעבירים את העכבר על כל כפתור, מחוון ושדה (גם על התווית שלו)
  const TIPS = {
    "#mzProjName": "השם שבו הפרויקט נשמר ברשימה ובקבצים שמייצאים",
    "#mzProjects": "כל הפרויקטים שנשמרו במחשב הזה",
    "#mzProjOpen": "פותח את הפרויקט שנבחר ברשימה (הנוכחי כבר שמור)",
    "#mzProjDel": "מוחק לגמרי את הפרויקט שנבחר ברשימה",
    "#mzProjNew": "מתחיל פרויקט ריק. הקודם נשאר ברשימה",
    "#mzProjSave": "שומר את כל הפרויקט לקובץ אחד - להעברה למחשב אחר או לגיבוי",
    "#mzProjFile": "פותח קובץ פרויקט ששמרתם קודם",
    "#mzPlay": "מנגן את כל הערוצים יחד מהסמן האדום. לחיצה נוספת משהה",
    "#mzStop": "עוצר. לחיצה נוספת חוזרת להתחלה",
    "#mzRec": "מקליט מהמיקרופון על המנגינה (עם אוזניות!). לחיצה נוספת מסיימת",
    "#mzTime": "המקום בשיר (דקות:שניות)",
    "#mzSeek": "גוררים כדי לקפוץ למקום אחר בשיר",
    "#mzClick": "נקישות בקצב המנגנייה, כדי לשיר בקצב",
    "#mzCount": "ארבע נקישות לפני שההקלטה מתחילה",
    "#mzLatency": "ההקלטה מאחרת? מגדילים. מקדימה? מקטינים (באלפיות שנייה)",
    "#mzMaster": "עוצמת כל השיר יחד (גם בייצוא)",
    "#mzUndo": "מבטל את הפעולה האחרונה (Ctrl+Z)",
    "#mzRedo": "מחזיר פעולה שבוטלה (Ctrl+Y)",
    "#mzZoomIn": "מגדיל את הגלים סביב הסמן, לעבודה מדויקת (גם Ctrl + גלגלת העכבר)",
    "#mzZoomOut": "מקטין חזרה, עד שרואים את כל השיר",
    "#mzScroll": "בהגדלה: גוררים כדי לראות חלק אחר של השיר",
    "#mzMicTest": "בודק את המיקרופון לפני הקלטה: פס ירוק = עוצמה טובה",
    "#mzMonitor": "שומעים את הקול שלכם באוזניות בזמן ההקלטה (רק עם אוזניות!)",
    "#mzMeterBox": "עוצמת המיקרופון: אפור = חלש, ירוק = טוב, אדום = חזק מדי",
    "#mzMarkA": "מסמן את תחילת הקטע במקום הסמן האדום",
    "#mzMarkB": "מסמן את סוף הקטע במקום הסמן האדום",
    "#mzMarkClear": "מבטל את סימון הקטע",
    "#mzPunch": "מקליט מחדש רק את הקטע המסומן (מתחיל שתי שניות לפני, ונעצר לבד בסוף)",
    "#mzLoop": "בניגון: חוזר על הקטע המסומן שוב ושוב, לתרגול",
    "#mzLyrics": "כותבים או מדביקים את מילות השיר, שורה בכל שורה",
    "#mzLyrTime": "מנגן, ולוחצים על \"השורה הבאה\" (או רווח) כשכל שורה מתחילה",
    "#mzLyrStep": "מסמן שהשורה הבאה מתחילה עכשיו (גם מקש רווח)",
    "#mzLyrClear": "מוחק את התזמון. השורות יוצגו לפי המקום בשיר",
    "#mzLyrBox": "השורה ששרים עכשיו, והשורה הבאה",
    "#mzDrive": "שומר את השיר כ-MP3 בגוגל דרייב שלכם",
    "#mzLinePath": "מספר השלוחה בקו הטלפון, למשל 5 או 1/2",
    "#mzLine": "מעלה את השיר לשלוחה בקו הטלפון, וכך שומעים אותו בטלפון",
    "#bmKit": "סוג צליל התופים: רגיל, אלקטרוני או עדין",
    "#bmStyle": "איך מנוגנים האקורדים: מכות רגילות, או צליל אחרי צליל (ארפג'יו)",
    "#bmFill": "מעבר תופים קצר בסוף כל ארבע תיבות, כמו מתופף אמיתי",
    "#mzPhExt": "מספר השלוחה בקו שבה נשמרות ההקלטות מהטלפון",
    "#mzPhLoad": "מציג את ההקלטות האחרונות מהשלוחה, ולחיצה על הקלטה מוסיפה אותה כערוץ",
    "#mzPhMake": "יוצר בקו שלוחה חדשה להקלטה: מתקשרים, מקישים את המספר ושרים",
    "#mzAiTopic": "כמה מילים על נושא השיר, למי הוא, ומה חשוב שיהיה בו",
    "#mzAiStyle": "הסגנון של המילים",
    "#mzAiGo": "כותב מילים לשיר בעזרת Gemini (צריך מפתח Gemini חינמי בחיבורי ספקים)",
    "#mzExport": "שומר את השיר המחובר כקובץ WAV באיכות מלאה",
    "#mzExportMp3": "שומר את השיר המחובר כקובץ MP3 קטן, נוח לשליחה",
    "#mzFile": "מוסיף שיר, מנגנון, הקלטה או סרטון מהמחשב",
    "#mzDemo": "מוסיף מנגנון מוכן, כדי להתנסות באולפן",
    "#mzYt": "מדביקים כאן קישור לשיר ביוטיוב",
    "#mzYtGo": "מוריד את השמע של השיר ומוסיף אותו כערוץ",
    "#mzInstall": "מתקין את אולפן ההקלטות כתוכנה עם חלון וסמל משלו",
    "#mzGuideBtn": "פותח את המדריך המלא בתחתית הדף",
    "#mzDesktop": "מוריד את הגרסה האחרונה של התוכנה למחשב (Windows), עם אולפן השידור ואולפן ההקלטות",
    "#bmBpm": "מהירות המנגנון: פעימות בדקה (100 = רגיל)",
    "#bmBars": "אורך המנגנון. בכל תיבה ארבע פעימות ואקורד אחד",
    "#bmPreset": "תבנית תופים מוכנה. אפשר לשנות במשבצות",
    "#bmInst": "הכלי שמנגן את האקורדים",
    "#bmBass": "מוסיף קו בס לפי האקורדים",
    "#bmChords": "אקורדים באותיות לועזיות עם רווח, למשל Am F C G7",
    "#bmGrid": "כל שורה היא תוף, כל משבצת רבע פעימה. לוחצים כדי להוסיף או להוריד מכה",
    "#bmPreview": "משמיע את המנגנון בלי להוסיף אותו",
    "#bmAdd": "מוסיף את המנגנון כערוץ, כדי להקליט עליו",
    ".mz-name": "שם הערוץ - לוחצים ומשנים",
    ".mz-wave": "גוררים כדי להזיז את הערוץ בזמן. לחיצה מזיזה את הסמן האדום",
    "[data-a=mute]": "השתקה: הערוץ לא נשמע ולא נכנס לייצוא",
    "[data-a=solo]": "סולו: שומעים רק את הערוצים שבסולו",
    "[data-a=del]": "מוחק את הערוץ",
    "[data-k=vol]": "כמה חזק הערוץ",
    "[data-k=pan]": "מאיזה צד הערוץ נשמע: ימין, אמצע או שמאל",
    "[data-k=reverb]": "תחושה של חדר או אולם",
    "[data-k=echo]": "חזרה של הקול כמה פעמים, בקצב השיר",
    "[data-k=start]": "באיזו שנייה בשיר הערוץ מתחיל",
    "[data-k=trimS]": "כמה שניות לחתוך מתחילת הערוץ",
    "[data-k=trimE]": "כמה שניות לחתוך מסוף הערוץ",
    "[data-k=fadeIn]": "בכמה שניות הקול עולה בהדרגה בהתחלה",
    "[data-k=fadeOut]": "בכמה שניות הקול יורד בהדרגה בסוף",
    ".mz-preset": "בוחרים סגנון וכל האפקטים מתכוונים לבד",
    "[data-k=eqLow]": "צלילים נמוכים: עומק וחום",
    "[data-k=eqMid]": "צלילים אמצעיים: נוכחות הקול",
    "[data-k=eqHigh]": "צלילים גבוהים: צלילות וברק",
    "[data-k=comp]": "מקרב בין קטעים חזקים לחלשים - קול אחיד ובולט",
    "[data-k=chorus]": "עותק מתנדנד של הקול - כמו כמה זמרים",
    "[data-k=drive]": "צליל מעוות, כמו גיטרה חשמלית",
    "[data-k=tremolo]": "עוצמה שעולה ויורדת במהירות",
    "[data-k=filter]": "צבע מיוחד: טלפון, רדיו, רחוק, דק, או הורדת זמזום חשמל",
    "[data-a=novocal]": "ערוץ חדש של המנגינה בלבד, בלי השירה",
    "[data-a=vocal]": "ערוץ חדש של השירה בלבד, מתוך השיר",
    "[data-a=denoise]": "ערוץ חדש בלי רעשי רקע קבועים (רחש, מזגן, מאוורר)",
    "[data-a=split]": "חותך את הערוץ לשניים במקום הסמן האדום",
    ".mz-key": "הסולם של השיר, לתיקון מדויק. לא יודעים? כל הצלילים",
    ".mz-tune": "עדין = טבעי, מלא = רובוטי (אוטו-טיון)",
    "[data-a=tune]": "ערוץ חדש שבו הקול מיושר לתווים הנכונים",
    "[data-a=norm]": "מגביר ערוץ חלש לעוצמה המלאה בלי עיוות",
    "[data-k=semi]": "בכמה חצאי טונים להגביה (+) או להנמיך (-)",
    ".mz-keep": "מסומן: רק הגובה משתנה. לא מסומן: גם המהירות, כמו טייפ",
    "[data-a=pitch]": "ערוץ חדש בסולם שנבחר",
    ".mz-tempo": "מהירות חדשה באחוזים (100% = כמו המקור)",
    "[data-a=tempo]": "ערוץ חדש במהירות שנבחרה, באותו גובה",
    "[data-a=dup]": "עותק של הערוץ, כדי לנסות דברים בלי לפגוע במקור",
    "[data-a=dl]": "שומר את הערוץ לבד כקובץ WAV",
  };
  function tips(scope) {
    for (const [sel, text] of Object.entries(TIPS)) {
      scope.querySelectorAll(sel).forEach((el) => {
        el.title = text;
        const label = el.closest("label");
        if (label) label.title = text;
      });
    }
  }
  tips(document);

  function renderGuide() {
    const box = $("mzGuideBody");
    if (!box || !window.MZ_HELP) return;
    for (const [title, lines] of window.MZ_HELP) {
      const d = document.createElement("details");
      const sm = document.createElement("summary");
      sm.textContent = title;
      d.appendChild(sm);
      let list = null;
      for (const line of lines) {
        const kind = line.startsWith("! ") ? "tip" : line.startsWith("× ") ? "warn" : line.startsWith("• ") ? "li" : /^\d+\.\s/.test(line) ? "step" : "p";
        if (kind === "li" || kind === "step") {
          if (!list || list.dataset.kind !== kind) { list = document.createElement(kind === "step" ? "ol" : "ul"); list.dataset.kind = kind; d.appendChild(list); }
          const li = document.createElement("li");
          li.textContent = kind === "li" ? line.slice(2) : line.replace(/^\d+\.\s/, "");
          list.appendChild(li);
        } else {
          list = null;
          const p = document.createElement("p");
          p.className = `mz-g-${kind}`;
          p.textContent = kind === "tip" ? `💡 ${line.slice(2)}` : kind === "warn" ? `⚠️ ${line.slice(2)}` : line;
          d.appendChild(p);
        }
      }
      box.appendChild(d);
    }
  }
  renderGuide();
  if ($("mzGuideBtn")) $("mzGuideBtn").addEventListener("click", () => { $("mzGuide").open = true; });

  // דוגמה להתנסות: מנגנון מוכן כערוץ (וגם לצילומי המדריכים: ‎?demo=1 פותח פרויקט דוגמה עם ערוץ ואפקטים פתוחים)
  async function addDemo() {
    audio();
    status("בונה דוגמה...");
    const buf = await renderBeat();
    const t = addTrack(buf, "דוגמה: מנגנון");
    status("נוספה דוגמה. לחצו \"▶ ניגון\", ונסו את הכפתורים של הערוץ.");
    return t;
  }
  $("mzDemo").addEventListener("click", () => { addDemo(); });
  async function demoMode() {
    root.dataset.busy = "1";
    startNew();
    $("mzProjName").value = "דוגמה";
    try {
      const t = await addDemo();
      if (t) t.el.querySelector(".mz-fx").open = true;
    } finally {
      delete root.dataset.busy;
    }
  }

  // פתיחה: חוזרים לפרויקט האחרון שעבדו עליו במחשב הזה
  (async () => {
    if (/[?&]demo=1/.test(location.search)) { await demoMode(); return; }
    const desk = window.studioDesktop;
    const opened = desk && desk.takeProject ? await desk.takeProject().catch(() => null) : null;
    if (opened && opened.data) { startNew(); await importProject(new Uint8Array(opened.data).buffer, opened.name || "פרויקט"); return; }
    let last = null;
    try { last = localStorage.getItem("mz-project"); } catch (e) { /* בלי זיכרון בדפדפן */ }
    try {
      const all = await listProjects();
      const id = all.some((p) => p.id === last) ? last : all[0] && all[0].id;
      if (id && await openProject(id)) { if (tracks.length) status("הפרויקט האחרון נפתח, כמו שהשארתם אותו."); return; }
    } catch (e) { /* בלי שמירה בדפדפן - עובדים בלי שמירה אוטומטית */ }
    startNew();
  })();
})();
