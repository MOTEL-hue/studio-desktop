/* אולפן שידור - שידור חי לאינטרנט (יוטיוב, פייסבוק, טוויץ' או כל שרת RTMP). פעיל רק בתוכנה למחשב, שיש בתוכה מקודד. */
(function () {
"use strict";
const S = window.Studio, U = S.ui, h = U.h, $ = U.$;
const D = () => window.studioDesktop;
S.hasLive = () => !!(D() && D().hasStream);
const PLAT = { youtube: ["YouTube", "rtmp://a.rtmp.youtube.com/live2"], facebook: ["Facebook", "rtmps://live-api-s.facebook.com:443/rtmp/"], twitch: ["Twitch", "rtmp://live.twitch.tv/app"], custom: ["אחר (כתובת RTMP)", ""] };
const QUAL = { "480": { h: 480, v: 1200, fps: 30, n: "480p (חיבור חלש)" }, "720": { h: 720, v: 2500, fps: 30, n: "720p, 30 תמונות (מומלץ)" }, "720-60": { h: 720, v: 4000, fps: 60, n: "720p, 60 תמונות" },
  "1080": { h: 1080, v: 4500, fps: 30, n: "1080p, 30 תמונות" }, "1080-60": { h: 1080, v: 6500, fps: 60, n: "1080p, 60 תמונות" } };
const cfg = () => (S.settings.stream = Object.assign({ platform: "youtube", server: PLAT.youtube[1], key: "", q: "720", enc: "auto", dual: false, platform2: "facebook", server2: PLAT.facebook[1], key2: "" }, S.settings.stream || {}));
const live = S.live = { on: false, status: null, rec: null, chain: Promise.resolve(), retries: 0, since: 0, wanted: false, encoders: null };

function mime() { return ["video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)); }
async function begin() {
  const c = cfg(), q = QUAL[c.q] || QUAL["720"]; S.ensureAudio();
  if (!/^rtmps?:\/\//i.test(c.server || "")) throw new Error("כתבו כתובת שרת שמתחילה ב-rtmp:// או rtmps://");
  if (!c.key) throw new Error("חסר מפתח שידור. מעתיקים אותו מהאתר של הפלטפורמה.");
  const dests = [{ url: c.server, key: c.key }];
  if (c.dual) { if (!/^rtmps?:\/\//i.test(c.server2 || "") || !c.key2) throw new Error("חסרים כתובת ומפתח ליעד השני"); dests.push({ url: c.server2, key: c.key2 }); }
  const r = await D().streamStart({ dests, url: c.server, key: c.key, vbit: q.v, fps: Math.min(S.settings.fps, q.fps), height: Math.min(S.settings.h, q.h), encoder: c.enc });
  if (r.error) throw new Error(r.error);
  const rec = live.rec = new MediaRecorder(S.outStream, { mimeType: mime(), videoBitsPerSecond: 8e6, audioBitsPerSecond: 160000 });
  live.chain = Promise.resolve();
  rec.ondataavailable = e => { if (e.data.size) live.chain = live.chain.then(() => e.data.arrayBuffer()).then(b => D().streamChunk(b)).catch(() => {}); };
  rec.start(250); live.on = true; live.since = Date.now(); live.wanted = true; refresh();
}
function end(manual) {
  live.wanted = !manual && live.wanted; try { if (live.rec && live.rec.state !== "inactive") live.rec.stop(); } catch (e) { /* סגור */ } live.rec = null; live.on = false; D().streamStop(); refresh();
}
U.toggleLive = async function () {
  if (live.on) { live.wanted = false; end(true); return; }
  live.retries = 0;
  try { await begin(); } catch (e) { U.toast(e.message, true); live.status = { state: "error", message: e.message }; refresh(); }
};
if (S.hasLive()) D().onStreamStatus(st => {
  live.status = st;
  if (st.state === "error" && live.wanted && live.retries < 3) {  // נסיון חיבור מחדש אוטומטי
    live.retries++; end(false); live.status = { state: "retry", message: "החיבור נותק. מתחבר שוב (" + live.retries + " מתוך 3)..." }; refresh();
    setTimeout(() => { if (live.wanted) begin().catch(e => { live.wanted = false; live.status = { state: "error", message: e.message }; refresh(); }); }, 3000);
  } else if (st.state === "error") { live.wanted = false; end(true); U.toast("השידור נעצר: " + (st.message || "שגיאה"), true); }
  else if (st.state === "live") live.retries = 0;
  refresh();
});
function elapsed() { return live.on ? U.fmtT(Date.now() - live.since) : ""; }
function refresh() {
  const c = $("#chipLive"), st = live.status || {};
  if (c) { c.hidden = !live.on; if (live.on) { c.textContent = (st.state === "live" ? "📡 בשידור " : "📡 מתחבר ") + elapsed(); c.className = "chip " + (st.state === "live" ? "red" : "dim"); } }
  const box = $("#liveStatus"); if (!box) return;
  const t = { idle: "לא משדרים", starting: "מתחבר לשרת...", retry: st.message, error: "שגיאה: " + (st.message || ""), stopped: "השידור הופסק" }[st.state];
  box.textContent = st.state === "live" ? "✅ בשידור חי · " + (st.fps || 0) + " תמונות/שנ'" + (st.bitrate ? " · " + Math.round(st.bitrate) + " קילו-ביט/שנ'" : "") + " · " + (st.speed || 1) + "x" + (st.speed && st.speed < 0.95 ? " (המחשב או החיבור לא עומדים בקצב)" : "") : (t || "לא משדרים");
  box.className = "livestat " + (st.state === "live" ? "ok" : st.state === "error" ? "bad" : "");
  const b = $("#liveBtn"); if (b) { b.textContent = live.on ? "⏹ עצירת השידור" : "📡 התחלת שידור חי"; b.className = "btn " + (live.on ? "danger" : "go"); }
}
setInterval(refresh, 1000);

U.renderLive = function () {
  if (U.tab !== "live") return; const body = $("#tabBody"), c = cfg(); body.innerHTML = "";
  body.append(h("p", { class: "hint", text: "משדרים את מה שמופיע בשידור החי של האולפן ישר לאינטרנט, כולל השמע. אפשר להקליט לקובץ באותו זמן." }),
    U.field("לאן משדרים", U.sel(Object.entries(PLAT).map(([k, v]) => [k, v[0]]), c.platform, v => { c.platform = v; if (PLAT[v][1]) c.server = PLAT[v][1]; S.save(); U.renderLive(); })),
    U.field("כתובת השרת", U.text(c.server, v => { c.server = v; S.save(); }, "rtmp://..."), c.platform === "custom" ? "הכתובת שמקבלים מהפלטפורמה, בלי המפתח." : "מוגדרת לבד לפי הפלטפורמה."),
    U.field("מפתח שידור", h("div", { class: "row" }, h("input", { type: "password", id: "liveKey", value: c.key, placeholder: "מעתיקים מהאתר של הפלטפורמה", oninput: e => { c.key = e.target.value.trim(); S.save(); } }),
      h("button", { class: "btn", text: "👁", title: "הצגה והסתרה", onclick: () => { const i = $("#liveKey"); i.type = i.type === "password" ? "text" : "password"; } })),
      "המפתח הוא כמו סיסמה: מי שיש לו אותו יכול לשדר בערוץ שלכם. הוא נשמר רק במחשב הזה, ולא נכנס לקובץ הגיבוי."),
    U.check("שידור גם ליעד נוסף (למשל יוטיוב ופייסבוק יחד)", c.dual, v => { c.dual = v; S.save(); U.renderLive(); }),
    c.dual ? h("div", { class: "slot", style: "padding:8px" },
      U.field("יעד שני", U.sel(Object.entries(PLAT).map(([k, v]) => [k, v[0]]), c.platform2, v => { c.platform2 = v; if (PLAT[v][1]) c.server2 = PLAT[v][1]; S.save(); U.renderLive(); })),
      U.field("כתובת השרת השני", U.text(c.server2, v => { c.server2 = v; S.save(); }, "rtmp://...")),
      U.field("מפתח שידור שני", h("input", { type: "password", value: c.key2, oninput: e => { c.key2 = e.target.value.trim(); S.save(); } }))) : null,
    U.field("איכות", U.sel(Object.entries(QUAL).map(([k, v]) => [k, v.n]), c.q, v => { c.q = v; S.save(); }), "איכות גבוהה צריכה חיבור העלאה חזק (בערך פי 1.5 מהמספר) ומחשב חזק יותר."),
    U.field("מקודד", h("select", { id: "liveEnc", onchange: e => { c.enc = e.target.value; S.save(); } }, h("option", { value: "auto", text: "אוטומטי (כרטיס מסך אם יש)" })), "כרטיס מסך (NVIDIA, Intel, AMD) מקודד בלי לעמיס על המעבד."),
    h("div", { class: "row" }, h("button", { class: "btn go", id: "liveBtn", onclick: () => U.toggleLive() })), h("div", { id: "liveStatus", class: "livestat" }),
    h("details", { class: "help guide" }, h("summary", { text: "איפה מוצאים את המפתח?" }),
      h("p", { text: "יוטיוב: studio.youtube.com ← צור ← שידור חי ← בחרו \"סטרימינג\" והעתיקו את \"מפתח שידור\"." }), h("p", { text: "פייסבוק: צור ← וידאו חי ← \"שימוש במפתח שידור\"." }), h("p", { text: "טוויץ': לוח הבקרה של היוצר ← הגדרות ← שידור." }),
      h("div", { class: "tip", text: "אחרי שהתחלתם לשדר, בעמוד של הפלטפורמה לוחצים \"התחל שידור\" כדי שהצופים יראו. ההשהיה בדרך כלל כמה שניות." })));
  refresh();
  D().streamEncoders().then(list => { const sel = $("#liveEnc"); if (!sel) return; const names = { x264: "מעבד (x264)", nvenc: "NVIDIA", qsv: "Intel", amf: "AMD" };
    list.forEach(k => sel.append(h("option", { value: k, text: names[k] || k, selected: c.enc === k }))); }).catch(() => {});
};
})();
