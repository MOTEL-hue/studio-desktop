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
  if (c.alsoRec && !S.rec) S.recStart().catch(() => {});
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
/* הצגה ברשת המקומית: תמונות JPEG מהסצנה החיה נשלחות לשרת קטן שבתוכנה, והוא מגיש אותן לכל מי שבאותה רשת */
const lan = S.lan = { on: false, timer: 0, busy: false, urls: [] };
const lc = document.createElement("canvas");
U.toggleLan = async function () {
  const c = cfg();
  if (lan.on) { clearInterval(lan.timer); lan.on = false; await D().lanStop(); U.renderLive(); return; }
  const r = await D().lanStart({ port: 8765, code: c.lanCode || "" }); if (r.error) { U.toast(r.error, true); return; }
  lan.on = true; lan.urls = r.ips.map(ip => "http://" + ip + ":" + r.port + "/" + (c.lanCode ? "?k=" + encodeURIComponent(c.lanCode) : ""));
  const q = +(c.lanQ || 720), fps = c.lanFps || 15;
  lan.timer = setInterval(() => {
    if (lan.busy) return; const src = S.pgmCanvas, h2 = Math.min(q, src.height), w2 = Math.round(src.width * h2 / src.height); lc.width = w2; lc.height = h2; lc.getContext("2d").drawImage(src, 0, 0, w2, h2);
    lan.busy = true; lc.toBlob(b => { if (!b) { lan.busy = false; return; } b.arrayBuffer().then(buf => { D().lanFrame(buf); lan.busy = false; }); }, "image/jpeg", .72);
  }, 1000 / fps);
  U.renderLive();
};
function lanRefresh() { const i = $("#lanInfo"); if (i) { i.textContent = lan.on ? "✅ פעיל. פתחו באחד מהמכשירים ברשת: " + (lan.urls.join("  |  ") || "(לא נמצאה כתובת רשת)") : "כבוי. בהפעלה הראשונה Windows עשוי לשאול על חומת האש: יש לאשר \"רשת פרטית\"."; i.className = "livestat " + (lan.on ? "ok" : ""); } }
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
setInterval(() => { const c = cfg(); if (live.armed && c.startAt && !live.on) { const [hh, mm] = c.startAt.split(":").map(Number), d = new Date(); if (d.getHours() === hh && d.getMinutes() === mm) { live.armed = false; U.toggleLive(); } } }, 5000);

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
    U.check("להקליט לקובץ גם בזמן השידור", c.alsoRec, v => { c.alsoRec = v; S.save(); }),
    U.field("התחלת שידור אוטומטית בשעה (לא חובה)", h("div", { class: "row" }, h("input", { type: "time", value: c.startAt || "", oninput: e => { c.startAt = e.target.value; S.save(); } }),
      h("button", { class: "btn", id: "liveArm", text: live.armed ? "⏰ מופעל (לחצו לביטול)" : "⏰ הפעלה בשעה", onclick: () => { if (!c.startAt) { U.toast("בחרו שעה", true); return; } live.armed = !live.armed; U.renderLive(); } })), "השידור יתחיל לבד בשעה שבחרתם. התוכנה צריכה להישאר פתוחה."),
    h("div", { class: "row" }, h("button", { class: "btn go", id: "liveBtn", onclick: () => U.toggleLive() })), h("div", { id: "liveStatus", class: "livestat" }),
    h("h3", { text: "📺 הצגה ברשת המקומית (במקום NDI)" }),
    h("p", { class: "hint", text: "משדר את הסצנה החיה לכל מחשב או טלפון באותה רשת (WiFi או כבל), בלי אינטרנט. פותחים את הכתובת בדפדפן, או ב-OBS כמקור \"דפדפן\", כדי לראות את התמונה." }),
    U.field("קוד גישה (לא חובה)", U.text(c.lanCode || "", v => { c.lanCode = v.trim(); S.save(); }, "למשל 1234"), "מי שמכניס כתובת בלי הקוד לא יראה את התמונה."),
    U.field("איכות התמונה", U.sel([["480", "480p (קל לרשת)"], ["720", "720p (מומלץ)"], ["1080", "1080p (דורש רשת חזקה)"]], c.lanQ || "720", v => { c.lanQ = v; S.save(); })),
    U.field("קצב תמונות", U.sel([[10, "10 בשנייה"], [15, "15 בשנייה (מומלץ)"], [24, "24 בשנייה"]], c.lanFps || 15, v => { c.lanFps = +v; S.save(); })),
    h("div", { class: "row" }, h("button", { class: "btn " + (lan.on ? "danger" : "go"), id: "lanBtn", text: lan.on ? "⏹ עצירת ההצגה ברשת" : "📺 התחלת הצגה ברשת", onclick: () => U.toggleLan() })), h("div", { id: "lanInfo", class: "livestat" }),
    h("details", { class: "help guide" }, h("summary", { text: "איפה מוצאים את המפתח?" }),
      h("p", { text: "יוטיוב: studio.youtube.com ← צור ← שידור חי ← בחרו \"סטרימינג\" והעתיקו את \"מפתח שידור\"." }), h("p", { text: "פייסבוק: צור ← וידאו חי ← \"שימוש במפתח שידור\"." }), h("p", { text: "טוויץ': לוח הבקרה של היוצר ← הגדרות ← שידור." }),
      h("div", { class: "tip", text: "אחרי שהתחלתם לשדר, בעמוד של הפלטפורמה לוחצים \"התחל שידור\" כדי שהצופים יראו. ההשהיה בדרך כלל כמה שניות." })));
  refresh(); lanRefresh();
  D().streamEncoders().then(list => { const sel = $("#liveEnc"); if (!sel) return; const names = { x264: "מעבד (x264)", nvenc: "NVIDIA", qsv: "Intel", amf: "AMD" };
    list.forEach(k => sel.append(h("option", { value: k, text: names[k] || k, selected: c.enc === k }))); }).catch(() => {});
};
})();
