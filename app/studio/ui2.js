/* אולפן שידור - ממשק (חלק 2): מיקסר שמע, שכבות, הקלטה, הגדרות ועזרה. */
(function () {
"use strict";
const S = window.Studio, U = S.ui, h = U.h, $ = U.$;
const TABS = [["audio", "🎚️ שמע"], ["overlays", "🏷️ שכבות"], ["show", "📋 תוכנית"], ["remote", "🎮 שלט"], ["rec", "⏺ הקלטה"], ["settings", "⚙️ הגדרות"], ["help", "❓ עזרה"]];
U.tab = "audio";

U.renderTabs = function () {
  const nav = $("#tabs"); nav.innerHTML = "";
  TABS.forEach(([id, l]) => nav.append(h("button", { class: "tab" + (U.tab === id ? " on" : ""), text: l, onclick: () => { U.tab = id; U.renderTabs(); } })));
  const body = $("#tabBody"); body.innerHTML = "";
  ({ audio: U.renderMixer, overlays: U.renderOverlays, show: U.renderShow, remote: U.renderRemote, rec: U.renderRec, settings: U.renderSettings, help: U.renderHelp })[U.tab]();
};

/* ---------- מיקסר שמע ---------- */
const dB = v => (v <= 0 ? -60 : Math.max(-60, 20 * Math.log10(v)));
U.renderMixer = function () {
  if (U.tab !== "audio") return; const body = $("#tabBody"); body.innerHTML = ""; U._meters = [];
  body.append(h("p", { class: "hint", text: "כאן שולטים בעוצמת כל מקור. הסרגל הירוק מראה כמה חזק הצליל כרגע: כדאי שיגיע עד הצהוב, ולא יגיע לאדום." }));
  const withAudio = S.sources.filter(s => s.hasAudio);
  if (!withAudio.length) body.append(h("p", { class: "empty", text: "אין עדיין מקור עם שמע. הוסיפו מיקרופון, כרטיס לכידה עם שמע, או קובץ שמע." }));
  withAudio.forEach(s => body.append(strip(s)));
  const st = S.settings, m = h("div", { class: "strip master" }, h("div", { class: "sh" }, h("b", { text: "🔊 עוצמה כללית (מה שיוצא לשידור ולהקלטה)" })), meter(null),
    U.field("עוצמה כללית", U.range(0, 1.5, .01, st.masterVol, v => { st.masterVol = v; S.applyAudioSettings(); S.save(); }, v => Math.round(v * 100) + "%")),
    U.check("מגביל עוצמה (מונע עיוות)", st.limiter, v => { st.limiter = v; S.applyAudioSettings(); S.save(); }, "אם צעקה פתאומית עוברת את המקסימום, המגביל מחליש אותה כך שלא יהיה צליל שבור."),
    U.field("סנכרון שמע להקלטה (אלפיות שנייה)", U.range(0, 400, 5, st.recDelay || 0, v => { st.recDelay = v; S.applyAudioSettings(); S.save(); }, v => v + " מ\"ש"), "אם בהקלטה הקול מקדים את התמונה, העלו מעט. ההשמעה החיה במחשב לא מושפעת."),
    h("details", { class: "slot", open: !st.monitor }, h("summary", { text: "השמעת השידור במחשב (אוזניות או רמקולים)" }),
      U.check("השמעת השידור במחשב הזה", st.monitor, v => { st.monitor = v; S.ensureAudio(); S.applyAudioSettings(); S.save(); U.monBtn(); }, "ההשמעה היא הכי מהירה שאפשר. עם רמקולים ליד מיקרופון תהיה יבבה, לכן עדיף אוזניות. כדי שהקהל ישמע, בחרו למטה את היציאה של המקרן."),
      h("small", { class: "hint", id: "latInfo" }),
      h("div", { id: "outDev" })));
  body.append(m); fillOutDevices(); U.meterLoop();
  const li = $("#latInfo"); if (li && S.ac) li.textContent = "השהיית השמע במחשב כרגע: כ-" + Math.round(((S.ac.baseLatency || 0) + (S.ac.outputLatency || 0)) * 1000) + " אלפיות שנייה.";
};
async function fillOutDevices() {
  const box = $("#outDev"); if (!box) return; try {
    const d = await S.devices(false); if (!d.out.length) return;
    box.append(U.field("יציאת שמע", U.sel([["", "ברירת מחדל"]].concat(d.out.map(x => [x.deviceId, x.label || "יציאה"])), S.settings.monitorDev, v => { S.settings.monitorDev = v; S.applyAudioSettings(); S.save(); })));
  } catch (e) { /* בלי רשימה */ }
}
function meter(src) {
  const bar = h("div", { class: "vu" }, h("i")), pk = h("small", { class: "pk", text: "-∞" }); U._meters.push({ src, bar: bar.firstChild, pk }); return h("div", { class: "vu-w" }, bar, pk);
}
U.meterLoop = function () {
  if (U._ml) return; const f = () => {
    U._ml = requestAnimationFrame(f);
    if (U.tab !== "audio" || !U._meters) return;
    U._meters.forEach(m => { const v = m.src ? S.level(m.src) : S.masterLevel(), d = dB(v), pct = Math.max(0, (d + 60) / 60 * 100);
      m.bar.style.width = pct + "%"; m.bar.className = d > -3 ? "hot" : d > -12 ? "warm" : ""; m._hold = Math.max(m._hold || -60, d); m._hold -= .25; m.pk.textContent = m._hold > -59 ? m._hold.toFixed(0) + " dB" : "-∞"; });
  }; U._ml = requestAnimationFrame(f);
};
function strip(s) {
  const a = s.audio, ap = () => { S.applyStrip(s); S.save(); };
  const adv = h("details", { class: "slot" }, h("summary", { text: "הגדרות מתקדמות" }),
    U.field("איזון שמאל / ימין", U.range(-1, 1, .05, a.pan, v => { a.pan = v; ap(); }, v => (v === 0 ? "מרכז" : v < 0 ? "שמאל" : "ימין")), "רלוונטי לשמע סטריאו, למשל מוזיקה."),
    U.field("חיזוק או החלשה בכניסה (דציבל)", U.range(-20, 20, 1, a.trim, v => { a.trim = v; ap(); }, v => v + " dB"), "מתאים כשהמקור חלש או חזק מאוד לפני שמזיזים את המחוון."),
    U.check("חיתוך בסים נמוך", a.lowcut, v => { a.lowcut = v; ap(); }, "מסנן רעמים, רעידות ורעש מאוורר. מומלץ למיקרופון."),
    U.field("בס (דציבל)", U.range(-12, 12, 1, a.lo, v => { a.lo = v; ap(); }, v => v + " dB")), U.field("קול אמצעי - בהירות הדיבור", U.range(-12, 12, 1, a.mid, v => { a.mid = v; ap(); }, v => v + " dB")),
    U.field("גבוהים - חדות", U.range(-12, 12, 1, a.hi, v => { a.hi = v; ap(); }, v => v + " dB")),
    U.check("מדחס עוצמה", a.comp, v => { a.comp = v; ap(); }, "מקרב בין הצלילים החזקים לחלשים, כדי שדיבור יישמע אחיד."),
    U.field("שער רעש (מעל הערך בלבד נשמע)", U.range(-70, -20, 1, a.gate, v => { a.gate = v; S.save(); }, v => (v <= -70 ? "כבוי" : v + " dB")), "משתיק את המקור כשאין דיבור, ומונע רעש רקע. התחילו מ- -45 והתאימו."),
    U.field("השהיית שמע (אלפיות שנייה)", U.range(0, 1000, 10, a.delay, v => { a.delay = v; ap(); }, v => v + " מ\"ש"), "אם הקול מקדים או מאחר אחרי התמונה, מכוונים כאן את הסנכרון."),
    U.field("מתי המקור נשמע", U.sel([["always", "תמיד"], ["follow", "רק כשהוא מופיע בשידור"]], a.mode, v => { a.mode = v; S.save(); }), "\"רק כשהוא מופיע\" מתאים לכמה מצלמות: הקול עובר ביחד עם התמונה."));
  return h("div", { class: "strip" }, h("div", { class: "sh" }, h("b", { text: s.name }), h("button", { class: "mini" + (a.mute ? " on" : ""), text: a.mute ? "🔇 מושתק" : "🔈", title: "השתקה", onclick: e => { a.mute = !a.mute; e.currentTarget.className = "mini" + (a.mute ? " on" : ""); e.currentTarget.textContent = a.mute ? "🔇 מושתק" : "🔈"; S.save(); } })),
    meter(s), U.field("עוצמה", U.range(0, 1.5, .01, a.vol, v => { a.vol = v; S.save(); }, v => Math.round(v * 100) + "%")), adv);
}

/* ---------- שכבות ---------- */
const POSOPT = Object.entries(S.POS);
function oColor(label, p, k) { return U.field(label, U.color(p[k], v => { p[k] = v + (p[k].length === 9 ? p[k].slice(7) : ""); S.save(); })); }
function oBg(label, p, k) {
  const al = p[k].length === 9 ? parseInt(p[k].slice(7), 16) / 255 : 1;
  return [U.field(label, U.color(p[k], v => { p[k] = v + (p[k].length === 9 ? p[k].slice(7) : ""); S.save(); })),
    U.field("שקיפות הרקע", U.range(0, 1, .05, al, v => { p[k] = p[k].slice(0, 7) + Math.round(v * 255).toString(16).padStart(2, "0"); S.save(); }, v => Math.round(v * 100) + "%"))];
}
function oFields(o) {
  const p = o.p, sv = () => S.save(), t = (l, k, ph, hint) => U.field(l, U.text(p[k], v => { p[k] = v; sv(); }, ph), hint), pos = (def) => U.field("מיקום", U.sel(POSOPT, p.pos || def, v => { p.pos = v; sv(); }));
  const size = () => U.field("גודל", U.range(40, 250, 5, p.size, v => { p.size = v; sv(); }, v => v + "%"));
  switch (o.type) {
    case "logo": return [U.field("קובץ תמונה", h("input", { type: "file", accept: "image/*", onchange: e => { const f = e.target.files[0]; if (!f) return; if (f.size > 1.5e6) { U.toast("התמונה גדולה מדי (עד 1.5 מ'). הקטינו אותה.", true); return; } const r = new FileReader(); r.onload = () => { p.src = r.result; sv(); U.toast("הלוגו נטען"); }; r.readAsDataURL(f); } }), "מומלץ PNG עם רקע שקוף."),
      pos(), U.field("גודל (אחוז מרוחב המסך)", U.range(3, 60, 1, p.size, v => { p.size = v; sv(); }, v => v + "%")), U.field("שקיפות", U.range(.1, 1, .05, p.opacity, v => { p.opacity = v; sv(); }, v => Math.round(v * 100) + "%")), U.field("שוליים", U.range(0, 15, .5, p.margin, v => { p.margin = v; sv(); }))];
    case "lower": return [t("שורה ראשית", "l1", "שם"), t("שורה שנייה", "l2", "תפקיד"), pos("br"), size(), oColor("צבע הכתב", p, "color"), oColor("צבע הפס", p, "bar"), oColor("צבע הדגשה", p, "accent")];
    case "ticker": return [U.field("הטקסט", h("textarea", { rows: 2, value: p.text, oninput: e => { p.text = e.target.value; sv(); } }), "אפשר לעדכן בזמן השידור."), U.field("מהירות", U.range(20, 400, 10, p.speed, v => { p.speed = v; sv(); })),
      U.field("גובה", U.range(36, 140, 2, p.h, v => { p.h = v; sv(); })), U.check("בראש המסך במקום בתחתית", p.top, v => { p.top = v; sv(); }), oColor("צבע הרקע", p, "bg"), oColor("צבע הכתב", p, "color")];
    case "clock": return [pos("tl"), size(), U.check("להציג שניות", p.seconds, v => { p.seconds = v; sv(); }), U.check("להציג תאריך", p.date, v => { p.date = v; sv(); }), U.check("תאריך עברי", p.hebrew, v => { p.hebrew = v; sv(); }), oBg("צבע הרקע", p, "bg"), oColor("צבע הכתב", p, "color")].flat();
    case "countdown": return [U.field("סוג", U.sel([["duration", "מספר דקות מרגע ההתחלה"], ["time", "עד שעה קבועה"]], p.mode, v => { p.mode = v; sv(); U.renderOverlays(); })),
      p.mode === "time" ? U.field("שעת היעד", h("input", { type: "time", value: p.time, oninput: e => { p.time = e.target.value; sv(); } })) : U.field("דקות", U.num(p.minutes, 1, 600, v => { p.minutes = v; sv(); })),
      t("כיתוב מעל המספרים", "label", ""), t("טקסט בסיום", "endText", ""),
      p.mode === "duration" ? h("div", { class: "row" }, h("button", { class: "btn go", text: "▶ התחלת ספירה", onclick: () => { p.endAt = Date.now() + p.minutes * 60000; o.on = true; U.renderOverlays(); } }), h("button", { class: "btn", text: "↺ איפוס", onclick: () => { p.endAt = 0; } })) : null,
      pos("tc"), size(), oBg("צבע הרקע", p, "bg"), oColor("צבע הכתב", p, "color")].flat();
    case "text": return [t("הטקסט", "text", ""), pos("bc"), size(), oBg("צבע הרקע", p, "bg"), oColor("צבע הכתב", p, "color")].flat();
    case "frame": return [oColor("צבע", p, "color"), U.field("עובי", U.range(2, 60, 1, p.w, v => { p.w = v; sv(); }))];
  }
}
U.renderOverlays = function () {
  if (U.tab !== "overlays") return; const body = $("#tabBody"); body.innerHTML = "";
  body.append(h("p", { class: "hint", text: "שכבות מוצגות מעל כל סצנה: לוגו, כתובית שם, שורה רצה, שעון ועוד. לחצו \"הצגה\" כדי להעלות אותן לשידור ו\"הסתרה\" להורדה. מקשי Shift+מספר מפעילים אותן מהמקלדת." }));
  S.overlays.forEach((o, i) => body.append(h("div", { class: "ov" + (o.on ? " live" : "") },
    h("div", { class: "oh" }, h("b", { text: (i < 9 ? (i + 1) + ". " : "") }), h("input", { class: "inl", value: o.name, oninput: e => { o.name = e.target.value; S.save(); } }),
      h("button", { class: "btn " + (o.on ? "danger" : "go"), text: o.on ? "הסתרה" : "הצגה", onclick: () => { o.on = !o.on; U.renderOverlays(); } }),
      h("button", { class: "mini", title: "מחיקה", text: "🗑", onclick: () => U.confirm("למחוק את השכבה \"" + o.name + "\"?", () => { S.overlays = S.overlays.filter(x => x !== o); S.save(); U.renderOverlays(); }) })),
    h("details", { class: "slot" }, h("summary", { text: S.OVERLAY_TYPES[o.type] + " - הגדרות" }), oFields(o)))));
  body.append(h("div", { class: "row" }, U.sel([["", "➕ הוספת שכבה..."]].concat(Object.entries(S.OVERLAY_TYPES)), "", v => { if (v) { S.overlays.push(S.newOverlay(v)); S.save(); U.renderOverlays(); } })));
};

/* ---------- הקלטה ---------- */
U.toggleRec = async function () {
  if (S.rec) return U.confirm("לעצור את ההקלטה ולסגור את הקובץ?", () => S.recStop());
  try { S.ensureAudio(); await S.recStart(); U.toast("ההקלטה התחילה"); if (!window.showSaveFilePicker) U.toast("ההקלטה נשמרת בזיכרון עד העצירה, ואז תורידו את הקובץ.", false); }
  catch (e) { if (e.message !== "בוטל") U.toast(e.message, true); }
};
U.renderRec = function () {
  if (U.tab !== "rec") return; const body = $("#tabBody"), st = S.settings; body.innerHTML = "";
  const disk = !!window.showSaveFilePicker;
  body.append(h("p", { class: "hint", text: "ההקלטה מתבצעת מאותו מסך שמשודר, בלי עצירה כשמחליפים סצנה או מצלמה. " + (disk ? "הדפדפן יבקש לבחור קובץ בהתחלה, והקלטה נכתבת ישר אליו תוך כדי, כך שגם אם הדפדפן ייסגר הקובץ ישאר." : "בדפדפן הזה ההקלטה נשמרת בזיכרון עד העצירה (מומלץ Chrome או Edge לשמירה ישירה לקובץ). הקלטות ארוכות מאוד צורכות זיכרון.") }),
    h("div", { class: "row" }, h("button", { class: "btn rec", text: S.rec ? "⏹ עצירה" : "⏺ התחלת הקלטה", onclick: U.toggleRec }), S.rec ? h("button", { class: "btn", text: S.rec.state === "pause" ? "▶ המשך" : "⏸ השהיה", onclick: () => S.recPause() }) : null),
    U.field("איכות", U.sel([[4, "רגילה (4 מגה-ביט)"], [8, "גבוהה (8)"], [12, "גבוהה מאוד (12)"], [20, "מקסימלית (20)"]], st.bitrate, v => { st.bitrate = +v; S.save(); }), "איכות גבוהה יותר = קובץ גדול יותר."),
    U.field("סוג קובץ", U.sel([["auto", "אוטומטי (MP4 אם אפשר)"], ["mp4", "MP4 - מתאים לכל מכשיר"], ["webm", "WebM"]], st.container, v => { st.container = v; S.save(); }), "שינוי חל על ההקלטה הבאה."),
    h("h3", { text: "הקלטות" }), h("div", { id: "recList" }));
  U.renderRecList();
};
U.renderRecList = function () {
  const box = $("#recList"); if (!box) return; box.innerHTML = "";
  if (!S.recordings.length) box.append(h("p", { class: "empty", text: "עוד לא הוקלט כלום בשיחה הזו." }));
  S.recordings.forEach(r => {
    const prog = h("small", { class: "pr" });
    box.append(h("div", { class: "rc" }, h("div", { class: "meta" }, h("b", { text: r.name }), h("small", { text: (r.state === "done" ? "הסתיימה" : r.state === "pause" ? "מושהית" : "מקליטה") + " · " + U.fmtT(S.recElapsed(r)) + " · " + U.mb(r.bytes) + (r.handle ? " · נשמר בקובץ" : "") })),
      r.state === "done" ? h("div", { class: "acts" },
        r.handle ? null : h("button", { class: "btn", text: "💾 שמירה", onclick: () => S.recDownload(r) }),
        !S.urls.driveStart ? null : h("button", { class: "btn", text: "☁ העלאה לדרייב", onclick: async e => { const b = e.currentTarget; b.disabled = true; try { const j = await S.uploadDrive(r, p => (prog.textContent = Math.round(p * 100) + "%")); prog.textContent = "הועלה ✓"; U.toast("הועלה לדרייב: " + (j.name || r.name)); } catch (er) { b.disabled = false; prog.textContent = ""; U.toast(er.message, true); } } }), prog,
        h("button", { class: "mini", text: "🗑", title: "הסרה מהרשימה (הקובץ נשאר)", onclick: () => { S.recordings = S.recordings.filter(x => x !== r); U.renderRecList(); } })) : null));
  });
};
S.on("rec", () => { $("#btnRec").textContent = S.rec ? "⏹ עצירה" : "⏺ הקלטה"; $("#btnRec").classList.toggle("on", !!S.rec); if (U.tab === "rec") U.renderRec(); });
S.on("recs", () => U.renderRecList());
setInterval(() => {
  const c = $("#chipRec"), r = S.rec; c.hidden = !r; if (r) { c.textContent = (r.state === "pause" ? "⏸ " : "● ") + U.fmtT(S.recElapsed(r)) + " · " + U.mb(r.bytes); c.className = "chip " + (r.state === "pause" ? "dim" : "red"); if (U.tab === "rec") U.renderRecList(); }
}, 1000);
window.addEventListener("beforeunload", e => { if (S.rec) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- הגדרות ---------- */
U.renderSettings = function () {
  const body = $("#tabBody"), st = S.settings; body.innerHTML = "";
  body.append(
    U.field("רזולוציית השידור וההקלטה", U.sel([["1280x720", "720p"], ["1920x1080", "1080p (מומלץ)"], ["2560x1440", "1440p"], ["3840x2160", "4K (כבד מאוד)"]], st.w + "x" + st.h, v => { if (S.rec) { U.toast("אי אפשר לשנות באמצע הקלטה", true); U.renderSettings(); return; } const [w, hh] = v.split("x").map(Number); S.setSize(w, hh); S.save(); }), "אם המחשב מתקשה והתמונה קופצת, הורידו לרזולוציה נמוכה או ל-30 תמונות בשנייה."),
    U.field("קצב תמונות", U.sel([[24, "24"], [30, "30 (מומלץ)"], [60, "60 (לתנועה חלקה, כבד)"]], st.fps, v => { if (S.rec) { U.toast("אי אפשר לשנות באמצע הקלטה", true); U.renderSettings(); return; } S.setFps(+v); S.save(); })),
    h("div", { class: "row" }, h("button", { class: "btn go", text: "⚡ מצב מהירות (720p, 60 תמונות)", title: "הכי פחות השהיה, ופחות עומס על המחשב", onclick: () => { if (S.rec) { U.toast("אי אפשר לשנות באמצע הקלטה", true); return; } S.setSize(1280, 720); S.setFps(60); S.save(); U.renderSettings(); U.toast("מצב מהירות הופעל"); } }),
      h("button", { class: "btn", text: "🎞️ מצב איכות (1080p, 30 תמונות)", onclick: () => { if (S.rec) { U.toast("אי אפשר לשנות באמצע הקלטה", true); return; } S.setSize(1920, 1080); S.setFps(30); S.save(); U.renderSettings(); U.toast("מצב איכות הופעל"); } })),
    U.check("מצב אולפן (תצוגה מקדימה לפני שידור)", st.studio, v => { st.studio = v; if (!v) S.pvw = S.pgm; S.emit("scenes"); S.save(); }, "מדליקים: בוחרים סצנה, רואים אותה בצד, ולוחצים \"שידור\". מכבים: לחיצה על סצנה משדרת אותה מיד."),
    h("h3", { text: "גיבוי ההגדרות" }), h("p", { class: "hint", text: "שומרים את הסצנות, השכבות וההגדרות לקובץ, ואפשר לטעון אותו במחשב אחר. המקורות (מצלמות וקבצים) יש לחבר מחדש." }),
    h("div", { class: "row" }, h("button", { class: "btn", text: "⬇ שמירה לקובץ", onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(S.snapshot())], { type: "application/json" })), download: "studio-settings.json" }); document.body.append(a); a.click(); a.remove(); } }),
      h("label", { class: "btn" }, "⬆ טעינה מקובץ", h("input", { type: "file", accept: ".json", hidden: true, onchange: e => { const f = e.target.files[0]; if (!f) return; f.text().then(async t => { try { const d = JSON.parse(t); await restoreAll(d); U.toast("ההגדרות נטענו"); } catch (er) { U.toast("הקובץ לא תקין", true); } }); } })),
      h("button", { class: "btn danger", text: "איפוס הכול", onclick: () => U.confirm("לאפס את כל הסצנות, השכבות וההגדרות?", async () => { localStorage.removeItem(S.KEY); location.reload(); }) })),
    h("h3", { text: "מקשי קיצור" }), h("table", { class: "keys" }, [["1-9", "בחירת סצנה"], ["רווח / Enter", "שידור התצוגה המקדימה"], ["C", "חיתוך מיידי"], ["Shift + 1-9", "הצגה או הסתרה של שכבה"], ["M", "השתקה / ביטול השתקה כללי"], ["לחיצה כפולה על סצנה", "שידור מיידי"], ["לחיצה כפולה בחלון ההצגה", "מסך מלא"]].map(([k, v]) => h("tr", {}, h("th", { text: k }), h("td", { text: v })))));
};
async function restoreAll(d) { S.sources.slice().forEach(s => S.disposeSource(s)); const f = await S.restore(d); S.setSize(S.settings.w, S.settings.h); S.start(); U.renderTabs(); U.renderTrans(); if (f.length) U.toast("חלק מההתקנים לא התחברו: " + f.join(" | "), true); }

/* ---------- עזרה ---------- */
U.renderHelp = function () {
  const body = $("#tabBody"); body.innerHTML = "";
  body.append(h("p", { class: "hint", text: "מדריך מלא לכל מי שלא מכיר אולפן. אם זו הפעם הראשונה, התחילו מ\"הפעלה צעד אחר צעד\"." }));
  S.HELP.forEach(([t, lines], i) => body.append(h("details", { class: "help guide", open: i === 2 }, h("summary", { text: t }),
    lines.map(l => /^! /.test(l) ? h("div", { class: "tip", text: l.slice(2) }) : /^× /.test(l) ? h("div", { class: "tip bad", text: l.slice(2) }) : h("p", { text: l })))));
};

/* ---------- אתחול ---------- */
function defaults() {
  const sc = [S.newScene("מסך מלא", "full"), S.newScene("זה לצד זה", "sbs"), S.newScene("תמונה בתוך תמונה", "pip"), S.newScene("ראשי וצד", "side")];
  S.scenes = sc; S.pgm = sc[0].id; S.pvw = sc[1].id;
  ["lower", "ticker", "clock", "countdown", "logo"].forEach(t => S.overlays.push(S.newOverlay(t)));
}
U.init(async () => {
  let saved = null; try { saved = JSON.parse(localStorage.getItem(S.KEY) || "null"); } catch (e) { /* פגום */ }
  let fails = [];
  if (saved && saved.scenes) fails = await S.restore(saved); else defaults();
  if (!S.scene(S.pgm) && S.scenes[0]) S.pgm = S.scenes[0].id; if (!S.scene(S.pvw) && S.scenes[0]) S.pvw = (S.scenes[1] || S.scenes[0]).id;
  S.start(); U.renderTabs(); U.renderTrans(); U.renderSources(); U.renderScenes(); U.nextLabel();
  if (fails.length) U.toast("חלק מההתקנים לא התחברו: " + fails.join(" | "), true);
  document.addEventListener("click", () => S.ensureAudio(), { once: true });
  let seen = false; try { seen = localStorage.getItem("studio.welcome") === "1"; } catch (e) { /* בלי שמירה */ }
  if (!seen) {
    const w = h("div", { class: "welcome" }, h("p", { text: "ברוכים הבאים לאולפן! אם זו הפעם הראשונה, יש מדריך קצר שמראה צעד אחר צעד איך מחברים מצלמה, מעלים לשידור ומקליטים." }),
      h("button", { class: "btn go", text: "📘 פתיחת המדריך", onclick: () => { U.showTab("help"); w.remove(); try { localStorage.setItem("studio.welcome", "1"); } catch (e) { /* ... */ } } }),
      h("button", { class: "btn", text: "הבנתי, תודה", onclick: () => { w.remove(); try { localStorage.setItem("studio.welcome", "1"); } catch (e) { /* ... */ } } }));
    $(".top").after(w);
  }
  navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener("devicechange", () => U.toast("התקן חובר או נותק. אם הכרטיס לא מופיע, הוסיפו אותו שוב."));
});
})();
