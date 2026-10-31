/* אולפן שידור - ממשק (חלק 1): עזרים, מקורות, סצנות ועורך הפריסה. החלק השני ב-ui2.js. */
(function () {
"use strict";
const S = window.Studio, U = S.ui = {};
const $ = (s, r) => (r || document).querySelector(s);

function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  for (const k in a || {}) {
    const v = a[k]; if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "text") e.textContent = v;
    else if (["value", "checked", "disabled", "selected", "title", "href", "src", "type", "min", "max", "step", "placeholder", "rows", "download", "target", "accept", "multiple"].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  if (a && a.title && !a["aria-label"] && (tag === "button" || tag === "a")) e.setAttribute("aria-label", a.title);
  kids.flat(9).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}
U.h = h; U.$ = $;
U.toast = function (msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : ""); clearTimeout(U._tt); U._tt = setTimeout(() => (t.className = ""), 4200); };
U.dialog = function (title, body, buttons, wide) {
  const d = $("#dlg"); d.innerHTML = ""; d.className = wide ? "wide" : "";
  const close = () => d.close();
  d.append(h("h2", { text: title }), h("div", { class: "dlg-body" }, body),
    h("div", { class: "dlg-btns" }, (buttons || [["סגירה", null, ""]]).map(([t, f, c]) => h("button", { class: "btn " + (c || ""), text: t, onclick: async () => { if (f) { if ((await f()) === false) return; } close(); } }))));
  if (!d.open) d.showModal(); return d;
};
U.confirm = (msg, yes) => U.dialog("לאשר?", h("p", { text: msg }), [["כן", yes, "danger"], ["ביטול", null, ""]]);
U.field = (label, ctl, hint) => h("label", { class: "fld" }, h("span", { class: "fl", text: label }), ctl, hint ? h("small", { text: hint }) : null);
U.sel = (opts, val, on) => { const s = h("select", { onchange: () => on(s.value) }, opts.map(([v, l]) => h("option", { value: v, text: l, selected: String(v) === String(val) }))); return s; };
U.range = (min, max, step, val, on, fmt) => {
  const o = h("output", { text: fmt ? fmt(val) : val });
  const r = h("input", { type: "range", min, max, step, value: val, oninput: () => { o.textContent = fmt ? fmt(+r.value) : r.value; on(+r.value); } });
  return h("div", { class: "rng" }, r, o);
};
U.check = (label, val, on, hint) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!val, onchange: e => on(e.target.checked) }), h("span", { text: label }), hint ? h("small", { text: hint }) : null);
U.color = (val, on) => h("input", { type: "color", value: /^#[0-9a-f]{6}/i.test(val) ? val.slice(0, 7) : "#000000", oninput: e => on(e.target.value) });
U.text = (val, on, ph) => h("input", { type: "text", value: val, placeholder: ph || "", oninput: e => on(e.target.value) });
U.num = (val, min, max, on) => h("input", { type: "number", value: val, min, max, oninput: e => on(+e.target.value) });
U.fmtT = ms => { const t = Math.floor(ms / 1000); return [Math.floor(t / 3600), Math.floor(t % 3600 / 60), t % 60].map(n => String(n).padStart(2, "0")).join(":"); };
U.mb = b => b > 1e9 ? (b / 1e9).toFixed(2) + " ג'יגה" : (b / 1e6).toFixed(1) + " מ'";
const touch = () => S.save();

/* ---------- מבנה הדף ---------- */
function build() {
  const app = $("#app"), B = document.body.dataset;
  S.urls = { driveStart: B.driveStart, driveChunk: B.driveChunk };
  U.tabs = {};
  app.append(
    h("header", { class: "top" },
      B.home ? h("a", { class: "back", href: B.home, text: "→ לאתר" }) : null, h("h1", { text: "🎬 אולפן שידור" }),
      h("span", { id: "chipRec", class: "chip", hidden: true }), h("span", { id: "chipShow", class: "chip dim", hidden: true }), h("span", { id: "chipLive", class: "chip red", hidden: true }), h("span", { id: "chipFps", class: "chip dim" }),
      h("span", { class: "grow" }),
      h("button", { class: "btn", id: "btnOut", text: "🖥️ חלון הצגה (מסך שני)", title: "פותח חלון נפרד שמציג את השידור במסך המלא, למשל במקרן או במסך השני", onclick: U.openOutput }),
      h("button", { class: "btn rec", id: "btnRec", text: "⏺ הקלטה", onclick: U.toggleRec }),
      h("button", { class: "btn", id: "btnMon", title: "שמיעת השידור במחשב הזה. שימו אוזניות, אחרת תהיה יבבה", onclick: U.toggleMon }),
      h("button", { class: "btn", id: "btnShot", text: "📸 צילום", title: "שומר תמונה של מה שמופיע בשידור עכשיו (מקש P)", onclick: () => U.act("shot") }),
      h("button", { class: "btn", id: "btnReplay", text: "⏪ הפעלה חוזרת", title: "מציג שוב את 10 השניות האחרונות (מקש Y). המאגר מופעל בלשונית הקלטה", hidden: true, onclick: () => U.act("replay") }),
      h("button", { class: "btn", id: "btnBrb", text: "⏸ רגע, חוזרים", title: "מעבר מיידי למסך המתנה, ולחיצה נוספת חוזרת (מקש B)", onclick: () => U.brb() }),
      h("button", { class: "btn", id: "btnA11y", text: "♿ נגישות", title: "גודל כתב, ניגודיות והפחתת תנועה", onclick: () => U.a11yDlg() }),
      h("button", { class: "btn go", id: "btnInstall", text: "📥 התקנה כתוכנה", title: "מתקין את האולפן כתוכנה במחשב, עם סמל וחלון משלו, ועובד גם בלי אינטרנט", hidden: true, onclick: () => U.install() }),
      h("button", { class: "btn", id: "btnTheme", title: "מעבר בין מצב יום ללילה", onclick: U.toggleTheme }),
      h("button", { class: "btn", text: "📘 מדריך למתחילים", onclick: () => U.showTab("help") })),
    h("main", { class: "cols" },
      h("section", { class: "col a" }, h("div", { class: "panel" }, h("h2", { text: "מקורות" }), h("div", { id: "srcList" }), h("button", { class: "btn wide-btn", text: "➕ הוספת מקור", onclick: U.addSourceDlg })),
        h("div", { class: "panel" }, h("h2", {}, "סצנות ", h("small", { text: "(מקשים 1-9)" })), h("div", { id: "sceneList" }), h("div", { class: "row" },
          h("button", { class: "btn", id: "btnUndo", text: "↶", title: "ביטול הפעולה האחרונה (Ctrl+Z)", "aria-label": "ביטול הפעולה האחרונה", onclick: () => U.undo() }), h("button", { class: "btn", id: "btnRedo", text: "↷", title: "שחזור (Ctrl+Y)", "aria-label": "שחזור", onclick: () => U.redo() }), h("button", { class: "btn", text: "➕ סצנה", onclick: U.addScene }), h("button", { class: "btn", text: "⧉ שכפול", onclick: U.dupScene }), h("button", { class: "btn", text: "🗑 מחיקה", onclick: U.delScene })))),
      h("section", { class: "col b" },
        h("div", { class: "mons" },
          h("figure", { class: "mon pvw" }, h("figcaption", { id: "capPvw", text: "תצוגה מקדימה" }), h("div", { class: "cvwrap" }, S.pvwCanvas)),
          h("div", { class: "takebar" }, h("button", { class: "btn take", id: "btnTake", text: "שידור ◀", title: "מעביר את התצוגה המקדימה לשידור (רווח או Enter)", onclick: () => U.safeLive(S.pvw) }),
            h("button", { class: "btn", text: "חיתוך", title: "מעבר מיידי בלי אפקט (מקש C)", onclick: () => U.safeLive(S.pvw, "cut") }),
            h("button", { class: "btn nextbtn", id: "btnNext", text: "הבאה ▶", title: "עוברים לסצנה שהוגדרה כבאה אחרי הסצנה בשידור (מקש N או PageDown)", onclick: () => U.act("next") }), h("div", { id: "transBox" }), h("label", { class: "ms", title: "מזיזים בעכבר את הסרגל, והמעבר מתקדם איתו. בקצה הימני הסצנה עוברת לשידור. נקרא גם T-bar בתוכנות אחרות." }, h("span", { text: "מעבר ידני (הזזה)" }), h("input", { type: "range", min: 0, max: 100, value: 0, id: "tbar", oninput: e => S.manualTrans(+e.target.value / 100), onchange: () => S.manualEnd() }))),
          h("figure", { class: "mon pgm" }, h("figcaption", { text: "שידור חי" }), h("div", { class: "cvwrap" }, S.pgmCanvas))),
        h("div", { class: "panel", id: "editor" })),
      h("section", { class: "col c" }, h("nav", { class: "tabs", id: "tabs" }), h("div", { id: "tabBody" }))));
  S.pgmCanvas.className = "cv"; S.pvwCanvas.className = "cv";
}
/* התקנה כתוכנה (PWA): הדפדפן מציע התקנה, והאולפן נפתח בחלון משלו ועובד גם בלי אינטרנט */
let installEv = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEv = e; const b = $("#btnInstall"); if (b && !window.studioDesktop) b.hidden = false; });  // בתוכנה למחשב אין צורך בהתקנה
window.addEventListener("appinstalled", () => { installEv = null; const b = $("#btnInstall"); if (b) b.hidden = true; U.toast("האולפן הותקן. מצאו אותו בתפריט התחל או בשולחן העבודה."); });
U.install = async function () { if (!installEv) { U.showTab("help"); return; } installEv.prompt(); await installEv.userChoice; installEv = null; const b = $("#btnInstall"); if (b) b.hidden = true; };
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) window.addEventListener("load", () => navigator.serviceWorker.register(document.querySelector('link[rel=manifest]').href.replace(/manifest\.webmanifest$/, "sw.js"), { scope: "/studio/" }).catch(() => {}));
U.toggleTheme = function () {
  const r = document.documentElement, t = r.getAttribute("data-theme") === "light" ? "dark" : "light"; r.setAttribute("data-theme", t);
  try { localStorage.setItem("vc-theme", t); } catch (e) { /* בלי שמירה */ } U.themeBtn();
};
U.toggleMon = function () { S.settings.monitor = !S.settings.monitor; S.ensureAudio(); S.applyAudioSettings(); S.save(); U.monBtn(); if (U.renderMixer) U.renderMixer();
  if (S.settings.monitor) U.toast("מאזינים לשידור. שימו אוזניות כדי למנוע יבבה."); };
U.monBtn = () => { const b = $("#btnMon"); if (b) { b.textContent = S.settings.monitor ? "🎧 האזנה: פעילה" : "🎧 האזנה: כבויה"; b.classList.toggle("on", !!S.settings.monitor); } };
U.themeBtn = () => { const b = $("#btnTheme"); if (b) b.textContent = document.documentElement.getAttribute("data-theme") === "light" ? "🌙 מצב לילה" : "☀️ מצב יום"; };
U.showTab = function (id) { U.tab = id; U.renderTabs(); };

/* ---------- חלון הצגה ---------- */
U.openOutput = async function () {
  let f = "popup,width=1280,height=720";
  try {
    if (window.getScreenDetails) {
      const d = await window.getScreenDetails(), sc = d.screens.find(x => x !== d.currentScreen && !x.isPrimary) || d.screens.find(x => x !== d.currentScreen);
      if (sc) f = "popup,left=" + sc.availLeft + ",top=" + sc.availTop + ",width=" + sc.availWidth + ",height=" + sc.availHeight;
    }
  } catch (e) { /* בלי הרשאה: חלון רגיל */ }
  S.outWin = window.open(document.body.dataset.output, "studio_out", f);
  if (!S.outWin) U.toast("הדפדפן חסם את החלון. אפשרו חלונות קופצים לאתר.", true);
  else U.toast("חלון ההצגה נפתח. לחיצה כפולה בתוכו = מסך מלא.");
};

/* ---------- מקורות ---------- */
const KIND = { device: ["📹", "מצלמה / כרטיס לכידה"], mic: ["🎤", "מיקרופון"], screen: ["🖥️", "שיתוף מסך"], video: ["🎞️", "סרטון"], audio: ["🎵", "שמע"], image: ["🖼️", "תמונה"], slides: ["📑", "מצגת"], text: ["🔤", "טקסט"], color: ["🎨", "צבע"], web: ["🌐", "דף אינטרנט (בתוכנה למחשב)"] };
U.visualKinds = ["device", "screen", "video", "image", "slides", "text", "color", "web"];
const isVisual = s => U.visualKinds.includes(s.kind);

U.renderSources = function () {
  const box = $("#srcList"); box.innerHTML = "";
  if (!S.sources.length) box.append(h("p", { class: "empty", text: "עוד אין מקורות. לחצו על \"הוספת מקור\" כדי לחבר את כרטיס הלכידה, מצלמה, מסך או קובץ." }));
  S.sources.forEach(s => {
    const cv = isVisual(s) ? h("canvas", { class: "thumb", width: 96, height: 54 }) : h("span", { class: "ico", text: KIND[s.kind][0] }); s._thumb = cv.tagName === "CANVAS" ? cv : null;
    const st = s.error ? "שגיאה: " + s.error : s.missing ? "צריך לחבר מחדש" : s.lost ? "האות נותק" : "";
    const ctl = [];
    if (s.el && (s.kind === "video" || s.kind === "audio")) ctl.push(
      h("button", { class: "mini", title: "הפעלה / עצירה", text: s.el.paused ? "▶" : "⏸", onclick: () => { S.ensureAudio(); s.el.paused ? s.el.play() : s.el.pause(); } }),
      h("button", { class: "mini", title: "מההתחלה", text: "⏮", onclick: () => { s.el.currentTime = 0; s.el.play(); } }),
      h("button", { class: "mini" + (s.el.loop ? " on" : ""), title: "חזרה בלולאה", text: "🔁", onclick: e => { s.el.loop = !s.el.loop; e.currentTarget.classList.toggle("on"); } }));
    if (s.kind === "slides") ctl.push(h("button", { class: "mini", text: "▶", title: "הבאה", onclick: () => S.slideGo(s, 1) }), h("button", { class: "mini", text: "◀", title: "הקודמת", onclick: () => S.slideGo(s, -1) }));
    const row = h("div", { class: "src" + (st ? " bad" : ""), draggable: isVisual(s) && !s.missing ? "true" : null, title: isVisual(s) ? "אפשר לגרור לתוך חלון בתצוגה המקדימה" : null, ondragstart: e => { e.dataTransfer.setData("text/studio-src", s.id); e.dataTransfer.effectAllowed = "copy"; } }, cv,
      h("div", { class: "meta" }, h("b", { text: s.name }), h("small", { text: st || KIND[s.kind][1] + (s.kind === "slides" ? " · " + (s.idx + 1) + "/" + s.slides.length : "") })),
      h("div", { class: "acts" }, ctl,
        s.missing ? h("button", { class: "mini on", text: "חיבור", onclick: () => U.addSourceDlg(s.kind, s) }) : h("button", { class: "mini", title: "הגדרות", text: "⚙", onclick: () => U.editSource(s) }),
        h("button", { class: "mini", title: "הסרה", text: "🗑", onclick: () => U.confirm("להסיר את \"" + s.name + "\"? הוא יוסר מכל הסצנות.", () => { S.removeSource(s.id); }) })));
    box.append(row);
  });
  U.renderEditor(); if (U.renderMixer) U.renderMixer();
};
setInterval(() => S.sources.forEach(s => { if (s._thumb && s._thumb.isConnected) { const c = s._thumb.getContext("2d"); c.fillStyle = "#111827"; c.fillRect(0, 0, 96, 54);
  const sc = S.newScene(); sc.slots[0].src = s.id; sc.slots[0].fit = "contain"; S.renderScene(c, sc, 96, 54); } }), 600);

U.addSourceDlg = function (kind, reuse) {
  if (typeof kind === "string") return U.addSourceForm(kind, reuse);
  const g = h("div", { class: "kinds" }, Object.entries(KIND).filter(([k]) => k !== "web" || (window.studioDesktop && studioDesktop.hasBrowserSource)).map(([k, [i, l]]) => h("button", { class: "kind", onclick: () => U.addSourceForm(k) }, h("span", { text: i }), h("b", { text: l }))));
  U.dialog("הוספת מקור", [h("p", { class: "hint", text: "בחרו מה להכניס לאולפן. אפשר להוסיף כמה שרוצים ולשלב ביניהם בסצנות." }), g], [["סגירה", null, ""]], true);
};
const RES = [["1280x720", "720p (HD)"], ["1920x1080", "1080p (Full HD)"], ["2560x1440", "1440p"], ["3840x2160", "4K"]];
U.addSourceForm = async function (kind, reuse) {
  const p = Object.assign({ res: "1920x1080", fps: 30, ec: false, ns: false, agc: false, aud: "none", auto: 0 }, reuse ? reuse.props : {}); let name = reuse ? reuse.name : "", files = [], devs = { video: [], audio: [], out: [] };
  const body = h("div", { class: "form" });
  const title = KIND[kind][1];
  if (kind === "device" || kind === "mic") {
    body.append(h("p", { class: "hint", text: "ממתין להרשאה... אשרו בדפדפן את השימוש במצלמה ובמיקרופון, כדי שנוכל להציג את שמות ההתקנים." }));
    U.dialog(title, body, [["ביטול", null, ""]], true);
    try { devs = await S.devices(true); } catch (e) { /* ממשיכים בלי שמות */ }
    body.innerHTML = "";
    const vOpts = devs.video.map(d => [d.deviceId, d.label || "מצלמה"]), aOpts = [["none", "בלי שמע מההתקן"]].concat(devs.audio.map(d => [d.deviceId, d.label || "מיקרופון"]));
    if (kind === "device") { p.vid = p.vid || (vOpts[0] || [])[0]; if (!vOpts.length) body.append(h("p", { class: "warn", text: "לא נמצאה אף מצלמה או כרטיס לכידה. בדקו שהכרטיס מחובר ושלא תפוס בתוכנה אחרת." })); }
    else p.aud = p.aud === "none" ? (aOpts[1] || [])[0] : p.aud;
    if (kind === "device") body.append(U.field("התקן וידאו", U.sel(vOpts, p.vid, v => (p.vid = v)), "כרטיס הלכידה מופיע בדרך כלל בשם של היצרן (למשל USB Video / HDMI)."),
      U.field("רזולוציה", U.sel(RES, p.res, v => (p.res = v)), "בחרו את הרזולוציה שהמצלמה שולחת לכרטיס. אם התמונה לא עולה, נסו נמוכה יותר."),
      U.field("קצב תמונות", U.sel([24, 25, 30, 50, 60].map(n => [n, n + " תמונות בשנייה"]), p.fps, v => (p.fps = +v))));
    body.append(U.field(kind === "device" ? "שמע של ההתקן" : "מיקרופון", U.sel(aOpts, p.aud, v => (p.aud = v)), kind === "device" ? "בכרטיס לכידה השמע בדרך כלל מגיע כהתקן נפרד (\"Digital Audio\" או \"USB Audio\"). בחרו אותו כאן כדי לשמוע את צליל המצלמה." : "בחרו את המיקרופון שבו מדברים."),
      U.check("ביטול הד (מומלץ רק למיקרופון עם רמקולים)", p.ec, v => (p.ec = v), "מסנן צליל שחוזר מהרמקולים. לכרטיס לכידה השאירו כבוי."),
      U.check("הפחתת רעש רקע", p.ns, v => (p.ns = v), "מוריד רעש קבוע. עלול לפגוע באיכות מוזיקה, לכן כבוי כברירת מחדל."),
      U.check("איזון עוצמה אוטומטי", p.agc, v => (p.agc = v), "הדפדפן מחזק ומחליש את הקול לבד. לשידור מקצועי עדיף כבוי ולשלוט במיקסר."));
    body.append(U.field("שם המקור", U.text(name, v => (name = v), kind === "device" ? "למשל: מצלמה ראשית" : "למשל: מיקרופון מגיש")));
    const sub = async () => {
      try { const src = await S.addSource({ kind, name: name || (kind === "device" ? (vOpts.find(o => o[0] === p.vid) || [0, "מצלמה"])[1] : "מיקרופון"), props: p }, reuse && reuse.id); U.afterAdd(src); }
      catch (e) { U.toast(e.message, true); return false; }
    };
    return U.dialog(title, body, [["הוספה", sub, "go"], ["ביטול", null, ""]], true);
  }
  if (kind === "screen") {
    body.append(h("p", { class: "hint", text: "הדפדפן יציג רשימה: אפשר לשתף את כל המסך, חלון אחד או לשונית. כדי לשתף גם שמע של הלשונית, סמנו זאת בחלון של הדפדפן." }),
      U.check("לשתף גם שמע (אם הדפדפן מאפשר)", true, v => (p.audio = v)), U.field("שם", U.text(name, v => (name = v), "שיתוף מסך")));
    return U.dialog(title, body, [["בחירת מסך", async () => { try { U.afterAdd(await S.addSource({ kind, name, props: p }, reuse && reuse.id)); } catch (e) { U.toast(e.message, true); return false; } }, "go"], ["ביטול", null, ""]]);
  }
  if (["video", "audio", "image", "slides"].includes(kind)) {
    const acc = { video: "video/*", audio: "audio/*", image: "image/*", slides: "image/*" }[kind];
    body.append(h("p", { class: "hint", text: { video: "בחרו קובץ וידאו מהמחשב. הוא לא מועלה לשום מקום ונשאר אצלכם.", audio: "קובץ שמע (מוזיקה, צלילי פתיחה) שאפשר להשמיע ולערבב בשידור.", image: "תמונה, למשל רקע, לוגו או שקף.", slides: "בחרו כמה תמונות בבת אחת. אפשר לייצא מצגת לתמונות ולהעלות כאן, ולדפדף ביניהן בשידור." }[kind] }),
      U.field("קובץ", h("input", { type: "file", accept: acc, multiple: kind === "slides", onchange: e => (files = [...e.target.files]) })), U.field("שם (לא חובה)", U.text(name, v => (name = v))));
    if (kind === "slides") body.append(U.field("מעבר אוטומטי כל (שניות, 0 = ידני)", U.num(p.auto, 0, 600, v => (p.auto = v))));
    return U.dialog(title, body, [["הוספה", async () => {
      if (!files.length) { U.toast("לא נבחר קובץ", true); return false; }
      try { U.afterAdd(await S.addSource({ kind, name, props: p, file: files[0], files }, reuse && reuse.id)); } catch (e) { U.toast(e.message, true); return false; }
    }, "go"], ["ביטול", null, ""]]);
  }
  if (kind === "text") { const q = { text: "כותרת", size: 120, color: "#ffffff", bg: "#16233F", align: "center", bold: true }; Object.assign(p, q, reuse ? reuse.props : {}); U.textFields(body, p, () => {}); body.prepend(U.field("שם", U.text(name, v => (name = v), "כותרת פתיחה")));
    return U.dialog(title, body, [["הוספה", async () => { U.afterAdd(await S.addSource({ kind, name: name || "טקסט", props: p }, reuse && reuse.id)); }, "go"], ["ביטול", null, ""]]); }
  if (kind === "web") {
    Object.assign(p, { url: "https://", w: 1280, h: 720, fps: 15 }, reuse ? reuse.props : {});
    body.append(h("p", { class: "hint", text: "מציג דף אינטרנט כשכבה בשידור: למשל תגובות חיות, לוח תוצאות, שעון או כל דף. רקע שקוף בדף יישאר שקוף." }), U.field("כתובת הדף", U.text(p.url, v => (p.url = v), "https://...")),
      U.field("גודל", U.sel([["960x540", "960x540 (קל)"], ["1280x720", "1280x720"], ["1920x1080", "1920x1080 (כבד)"]], p.w + "x" + p.h, v => { [p.w, p.h] = v.split("x").map(Number); })),
      U.field("קצב רענון", U.sel([[10, "10 תמונות בשנייה"], [15, "15 (מומלץ)"], [30, "30"]], p.fps, v => (p.fps = +v))), U.field("שם", U.text(name, v => (name = v), "דף אינטרנט")));
    return U.dialog(title, body, [["הוספה", async () => { if (!/^https?:\/\//i.test(p.url)) { U.toast("הכתובת צריכה להתחיל ב-http או https", true); return false; }
      try { U.afterAdd(await S.addSource({ kind, name: name || "דף אינטרנט", props: p }, reuse && reuse.id)); } catch (e) { U.toast(e.message, true); return false; } }, "go"], ["ביטול", null, ""]]);
  }
  if (kind === "color") { p.color = p.color || "#16233F"; body.append(U.field("שם", U.text(name, v => (name = v), "רקע כחול")), U.field("צבע", U.color(p.color, v => (p.color = v))));
    return U.dialog(title, body, [["הוספה", async () => { U.afterAdd(await S.addSource({ kind, name: name || "צבע", props: p }, reuse && reuse.id)); }, "go"], ["ביטול", null, ""]]); }
};
U.textFields = function (body, p, onchange) {
  const up = f => v => { f(v); onchange(); };
  body.append(U.field("הטקסט", h("textarea", { rows: 4, value: p.text, oninput: e => { p.text = e.target.value; onchange(); } }), "אפשר כמה שורות."),
    U.field("גודל", U.range(30, 300, 5, p.size, up(v => (p.size = v)))), U.field("צבע הכתב", U.color(p.color, up(v => (p.color = v)))), U.field("צבע הרקע", U.color(p.bg || "#000000", up(v => (p.bg = v)))),
    U.field("יישור", U.sel([["center", "מרכז"], ["right", "ימין"], ["left", "שמאל"]], p.align, up(v => (p.align = v)))), U.check("כתב עבה", p.bold, up(v => (p.bold = v))));
};
U.afterAdd = function (src) {
  if (U.visualKinds.includes(src.kind)) S.scenes.forEach(sc => { if (sc.slots.some(s => s.src === src.id)) return; const n = S.slotCount(sc); for (let i = 0; i < n; i++) if (!sc.slots[i].src) { sc.slots[i].src = src.id; break; } });
  U.toast("נוסף: " + src.name); S.emit("scenes"); S.save();
};
U.editSource = function (s) {
  if (s.kind === "text") { const body = h("div", { class: "form" }); U.textFields(body, s.props, () => { S.renderText(s); S.save(); });
    return U.dialog("עריכת טקסט: " + s.name, body, [["סגירה", null, "go"]]); }
  if (s.kind === "color") return U.dialog("צבע", U.field("צבע", U.color(s.props.color, v => { s.props.color = v; S.save(); })), [["סגירה", null, "go"]]);
  const body = h("div", { class: "form" }, U.field("שם", U.text(s.name, v => { s.name = v; s.def.name = v; S.save(); })));
  if (s.kind === "slides") body.append(U.field("מעבר אוטומטי כל (שניות, 0 = ידני)", U.num(s.props.auto, 0, 600, v => { s.props.auto = v; S.startSlideTimer(s); })));
  if (s.kind === "device" || s.kind === "mic") body.append(h("button", { class: "btn", text: "שינוי התקן או הגדרות", onclick: () => { $("#dlg").close(); const old = s; S.disposeSource(old); S.addMissing(old.def, old.id); U.addSourceForm(old.kind, old); } }));
  U.dialog("הגדרות מקור", body, [["סגירה", () => { S.emit("sources"); }, "go"]]);
};

/* ---------- סצנות ---------- */
U.editId = () => (S.settings.studio ? S.pvw : S.pgm);
U.renderScenes = function () {
  const box = $("#sceneList"); box.innerHTML = "";
  S.scenes.forEach((sc, i) => {
    const cv = h("canvas", { class: "thumb big", width: 160, height: 90 }); sc._thumb = cv;
    const tag = sc.id === S.pgm ? "pgm" : sc.id === S.pvw && S.settings.studio ? "pvw" : "";
    box.append(h("div", { class: "scn " + tag, onclick: () => { S.settings.studio ? (S.pvw = sc.id, S.emit("scenes")) : U.safeLive(sc.id); S.save(); }, ondblclick: () => U.safeLive(sc.id) },
      cv, h("div", { class: "meta" }, h("b", { text: (i < 9 ? (i + 1) + ". " : "") + sc.name }), h("small", { text: tag === "pgm" ? "בשידור" : tag === "pvw" ? "בתצוגה מקדימה" : S.LAYOUTS[sc.layout].name })),
      h("button", { class: "mini live", title: "שידור הסצנה הזו עכשיו", text: "◀", onclick: e => { e.stopPropagation(); U.safeLive(sc.id); } })));
  });
  $("#capPvw").textContent = S.settings.studio ? "תצוגה מקדימה" : "מצב ישיר (בלי תצוגה מקדימה)";
  $(".mon.pvw").style.display = S.settings.studio ? "" : "none"; $("#btnTake").style.display = S.settings.studio ? "" : "none";
  U.renderEditor(); S.save();
};
setInterval(() => S.scenes.forEach(sc => { if (sc._thumb && sc._thumb.isConnected) S.renderScene(sc._thumb.getContext("2d"), sc, 160, 90); }), 700);
U.nextLabel = function () { const b = $("#btnNext"), n = U.nextScene && U.nextScene(); if (b) b.textContent = n ? "הבאה: " + n.name + " ▶" : "הבאה ▶"; };
S.on("scenes", () => { U.renderScenes(); U.nextLabel(); const tb = $("#tbar"); if (tb && !S.trans) tb.value = 0; });
S.on("sources", () => U.renderSources());
U.addScene = function () {
  const sc = S.newScene("סצנה " + (S.scenes.length + 1), "full");
  S.scenes.push(sc); if (!S.pvw) S.pvw = sc.id; if (!S.pgm) S.pgm = sc.id; S.settings.studio ? (S.pvw = sc.id) : 0; S.emit("scenes");
};
U.dupScene = function () {
  const sc = S.scene(U.editId()); if (!sc) return; const c = JSON.parse(JSON.stringify(sc, (k, v) => (k === "_thumb" ? undefined : v))); c.id = S.uid(); c.name += " (עותק)";
  S.scenes.splice(S.scenes.indexOf(sc) + 1, 0, c); S.pvw = c.id; S.emit("scenes");
};
U.delScene = function () {
  const sc = S.scene(U.editId()); if (!sc) return;
  if (sc.id === S.pgm) return U.toast("אי אפשר למחוק את הסצנה שבשידור", true);
  U.confirm("למחוק את \"" + sc.name + "\"?", () => { S.scenes = S.scenes.filter(x => x !== sc); S.pvw = S.pgm; S.emit("scenes"); });
};

/* ---------- עורך הסצנה ---------- */
/* צבע ואפקטים לכל חלון: תיקון צבע ומסך ירוק */
function effectsPanel(sl, ch) {
  const cc = sl.cc = sl.cc || Object.assign({}, S.CC_DEFAULT), cr = sl.chroma = sl.chroma || { on: false, color: "#00ff00", sim: .12, smooth: .08, spill: .5 };
  const rng = (label, k, min, max, step, unit) => U.field(label, U.range(min, max, step, cc[k], v => { cc[k] = v; ch(); }, v => v + (unit || "")));
  const eye = window.EyeDropper ? h("button", { class: "btn", text: "🎯 בחירת צבע מהמסך", title: "לוחצים על הרקע הירוק בתמונה", onclick: async () => { try { const r = await new window.EyeDropper().open(); cr.color = r.sRGBHex; cr.on = true; ch(); U.renderEditor(); } catch (e) { /* בוטל */ } } }) : null;
  return h("details", { class: "slot" }, h("summary", { text: "צבע ואפקטים (מסך ירוק, תיקון צבע)" }),
    U.field("שקיפות החלון", U.range(.1, 1, .05, sl.opacity == null ? 1 : sl.opacity, v => { sl.opacity = v; ch(); }, v => Math.round(v * 100) + "%")),
    U.field("סיבוב החלון", U.range(-180, 180, 1, sl.rot || 0, v => { sl.rot = v; ch(); }, v => v + "°")),
    U.field("צורת החלון", U.sel([["", "לפי העיצוב (מלבן או פינות עגולות)"], ["circle", "עגול"]], sl.shape || "", v => { sl.shape = v; ch(); })),
    U.check("עצירת תמונה (קיפאון)", sl.freeze, v => { sl.freeze = v; ch(); }),
    U.check("מסך ירוק: הסרת הרקע", cr.on, v => { cr.on = v; ch(); }, "מסיר צבע אחד מהתמונה (בדרך כלל ירוק או כחול) כדי שהאדם יופיע על הרקע של הסצנה."),
    h("div", { class: "row" }, U.color(cr.color, v => { cr.color = v; ch(); }), eye),
    U.field("עוצמת ההסרה", U.range(.02, .6, .01, cr.sim, v => { cr.sim = v; ch(); }), "כמה גוונים קרובים לצבע ייעלמו. מעלים אם נשאר ירוק, מורידים אם האדם מתחיל להיעלם."),
    U.field("רכות הקצוות", U.range(0, .3, .01, cr.smooth, v => { cr.smooth = v; ch(); })),
    U.field("ניקוי שיירי צבע בקצוות", U.range(0, 1, .05, cr.spill, v => { cr.spill = v; ch(); })),
    h("hr"), rng("בהירות", "b", 20, 220, 1, "%"), rng("ניגודיות", "c", 20, 220, 1, "%"), rng("רוויית צבע", "s", 0, 300, 1, "%"), rng("גוון", "h", -180, 180, 1, "°"),
    rng("טשטוש", "bl", 0, 20, .5, " פיקסלים"), rng("שחור-לבן", "g", 0, 100, 1, "%"), rng("ספיה (צבע ישן)", "sep", 0, 100, 1, "%"),
    h("button", { class: "btn", text: "↺ איפוס צבע ואפקטים", onclick: () => { sl.cc = null; sl.chroma = null; ch(); U.renderEditor(); } }));
}
function miniLayout(key) {
  const sc = S.newScene("", key), cells = S.cellsOf(sc), ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 64 36"); svg.setAttribute("class", "mini-lay");
  cells.forEach((c, i) => { const r = document.createElementNS(ns, "rect"); r.setAttribute("x", c[0] * 64 + .8); r.setAttribute("y", c[1] * 36 + .8); r.setAttribute("width", c[2] * 64 - 1.6); r.setAttribute("height", c[3] * 36 - 1.6); r.setAttribute("rx", 1.5); r.setAttribute("class", "c" + i); svg.append(r); });
  return svg;
}
U.renderEditor = function () {
  const box = $("#editor"); if (!box) return; const sc = S.scene(U.editId()) || S.scene(S.pgm); box.innerHTML = "";
  if (!sc) { box.append(h("p", { class: "empty", text: "אין סצנות. הוסיפו סצנה." })); return; }
  const o = sc.opts, ch = () => S.save();
  const srcOpts = [["", "(ריק)"]].concat(S.sources.filter(isVisual).map(s => [s.id, s.name]));
  box.append(h("h2", {}, "עריכת סצנה: ", h("input", { class: "inl", value: sc.name, oninput: e => { sc.name = e.target.value; ch(); }, onchange: () => U.renderScenes() }), h("small", { text: S.settings.studio ? " (התצוגה המקדימה)" : " (בשידור)" })),
    U.field("מעבר מיוחד לסצנה הזו", U.sel([["", "לפי ההגדרה הכללית"]].concat(Object.entries(S.TRANS)), sc.transType || "", v => { sc.transType = v; ch(); }), "אפקט המעבר כשעוברים אל הסצנה הזו, במקום האפקט שבתפריט המעברים. למשל סצנת פתיחה עם סטינגר."),
    U.field("אחרי הסצנה הזו עוברים אל (מקש N, כפתור \"הבאה\", שלט מצגות וטלפון)", U.sel([["", "הסצנה הבאה ברשימה"]].concat(S.scenes.filter(x => x !== sc && !x.brb && !x.replay).map(x => [x.id, x.name])), sc.next || "", v => { sc.next = v; ch(); U.nextLabel(); })),
    h("div", { class: "lays" }, Object.keys(S.LAYOUTS).map(k => h("button", { class: "lay" + (sc.layout === k ? " on" : ""), title: S.LAYOUTS[k].name, onclick: () => { sc.layout = k; sc.slots.forEach(x => { x.rect = null; }); S.emit("scenes"); } }, miniLayout(k), h("small", { text: S.LAYOUTS[k].name })))));
  const n = S.slotCount(sc), slots = h("div", { class: "slots" }), nl = S.cellsOf(sc).length;
  for (let i = 0; i < n; i++) {
    const sl = sc.slots[i];
    slots.append(h("details", { class: "slot", open: i < 2 || i === U.selectedWindow(), ontoggle: e => { if (e.target.open && U.selectWindow) U.selectWindow(i); } }, h("summary", {}, "חלון " + (i + 1) + (sl.src && S.src(sl.src) ? ": " + S.src(sl.src).name : "")),
      h("div", { class: "row" },
        sl.rect ? h("button", { class: "btn", text: "↺ חזרה למיקום הפריסה", onclick: () => { sl.rect = null; ch(); U.renderEditor(); U.drawSel(); } }) : null,
        n > 1 ? h("button", { class: "btn", text: "⬆ הבאה לחזית", title: "מעל שאר החלונות", onclick: () => { sl.z = Math.max(0, ...sc.slots.map(q => q.z || 0)) + 1; ch(); } }) : null,
        i >= nl ? h("button", { class: "btn danger", text: "🗑 הסרת החלון", onclick: () => { sl.src = null; sl.rect = null; sc.extra = Math.max(0, (sc.extra || 0) - 1); for (let q = i; q < S.MAXSLOTS - 1; q++) sc.slots[q] = sc.slots[q + 1]; sc.slots[S.MAXSLOTS - 1] = S.newSlot(); ch(); U.selectWindow(-1); U.renderEditor(); } }) : null),
      U.field("מקור", U.sel(srcOpts, sl.src || "", v => { sl.src = v || null; ch(); U.renderEditor(); })),
      U.field("התאמה למסך", U.sel([["cover", "מילוי מלא (חותך קצוות)"], ["contain", "הכל נראה, פסים שחורים"], ["scene", "הכל נראה, הרקע של הסצנה בפסים"], ["blur", "הכל נראה, רקע מטושטש מהסרטון"], ["stretch", "מתיחה מדויקת (בלי פסים ובלי חיתוך)"]], sl.fit, v => { sl.fit = v; ch(); }),
        "\"רקע מטושטש\" ממלא את השטחים הריקים בלי לחתוך כלום. \"הרקע של הסצנה\" משאיר מקום לרקע ולאפקטים שבחרתם. \"מתיחה\" ממלאת הכול אך מעוותת את התמונה."),
      h("div", { class: "row" }, h("button", { class: "btn", text: "✂ חיתוך בעכבר...", title: "בוחרים בעכבר איזה חלק מהסרטון להציג", onclick: () => U.cropDlg(sc, i) }),
        h("button", { class: "btn", text: "🪄 הסרת פסים שחורים", title: "מזהה פסים שחורים שבתוך הסרטון וחותך אותם", onclick: () => { const g = S.detectBars(S.src(sl.src)); if (g) { sl.crop = g; ch(); U.toast("הפסים השחורים נחתכו"); U.renderEditor(); } else U.toast("לא נמצאו פסים שחורים (או שאין תמונה)", true); } }),
        sl.crop ? h("button", { class: "btn", text: "↺ ביטול חיתוך", onclick: () => { sl.crop = null; ch(); U.renderEditor(); } }) : null),
      U.field("הגדלה", U.range(1, 4, .05, sl.zoom, v => { sl.zoom = v; ch(); }, v => v.toFixed(2) + "x")),
      U.field("הזזה אופקית", U.range(-1, 1, .02, sl.px, v => { sl.px = v; ch(); })), U.field("הזזה אנכית", U.range(-1, 1, .02, sl.py, v => { sl.py = v; ch(); })),
      U.check("היפוך (כמו מראה)", sl.mirror, v => { sl.mirror = v; ch(); }), U.field("כיתוב על החלון", U.text(sl.label, v => { sl.label = v; ch(); }, "למשל: שם האורח")),
      effectsPanel(sl, ch)));
  }
  const addBtn = n < S.MAXSLOTS ? h("button", { class: "btn", text: "➕ חלון נוסף", title: "עוד חלון חופשי שאפשר למקם בעכבר", onclick: () => { sc.extra = (sc.extra || 0) + 1; ch(); U.renderEditor(); U.selectWindow(S.slotCount(sc) - 1); } }) : null;
  const style = h("details", { class: "slot" }, h("summary", { text: "עיצוב: רווחים, פינות, צבעים, מסגרת" }),
    U.field("רווח בין החלונות", U.range(0, 80, 1, o.gap, v => { o.gap = v; ch(); })), U.field("עיגול פינות", U.range(0, 120, 1, o.radius, v => { o.radius = v; ch(); })),
    U.field("סוג רקע", U.sel(Object.entries(S.BGS), o.bgKind || "gradient", v => { o.bgKind = v; ch(); }), "רקעים מונפשים שמופיעים בשטחים הריקים מאחורי הסרטון."),
    U.field("צבע רקע עליון", U.color(o.bg1, v => { o.bg1 = v; ch(); })), U.field("צבע רקע תחתון", U.color(o.bg2, v => { o.bg2 = v; ch(); })),
    U.field("אפקט", U.sel(Object.entries(S.FXS), o.fxKind || "none", v => { o.fxKind = v; ch(); }), "נצנצים, זיקוקים, קונפטי ועוד. כברירת מחדל הם מופיעים מאחורי החלונות, בשטחים הריקים."),
    U.field("עוצמת האפקט", U.range(1, 5, 1, o.fxLevel || 3, v => { o.fxLevel = v; ch(); })), U.check("האפקט גם מעל הסרטון", o.fxOver, v => { o.fxOver = v; ch(); }),
    U.field("תמונת רקע", U.sel(srcOpts, o.bgSrc || "", v => { o.bgSrc = v || null; ch(); }), "במקום צבעי הרקע. אפשר לבחור תמונה או סרטון."),
    U.field("עובי מסגרת", U.range(0, 30, 1, o.borderW, v => { o.borderW = v; ch(); })), U.field("סגנון מסגרת", U.sel(Object.entries(S.BORDERS), o.borderStyle || "solid", v => { o.borderStyle = v; ch(); })), U.field("צבע מסגרת", U.color(o.border, v => { o.border = v; ch(); })), U.check("צל סביב החלונות", o.shadow, v => { o.shadow = v; ch(); }));
  if (sc.layout === "pip") style.append(U.field("גודל החלון הקטן", U.range(.12, .5, .01, o.pipSize, v => { o.pipSize = v; ch(); }, v => Math.round(v * 100) + "%")),
    U.field("מיקום החלון הקטן", U.sel(Object.entries(S.CORNERS), o.corner, v => { o.corner = v; ch(); })), U.check("חלון קטן עגול", o.pipRound, v => { o.pipRound = v; ch(); }));
  box.append(h("p", { class: "hint", text: "בעכבר: גררו מקור מהרשימה לתוך חלון בתצוגה המקדימה, לחצו על חלון כדי להזיז אותו, וגררו פינה או צד כדי לשנות גודל (Shift שומר על הפרופורציה). לחיצה כפולה מחזירה למיקום הפריסה." }), slots, h("div", { class: "row" }, addBtn), style);
};

/* ---------- מעברים ---------- */
function renderTrans() {
  const b = $("#transBox"); b.innerHTML = "";
  b.append(U.sel(Object.entries(S.TRANS), S.settings.trans, v => { S.settings.trans = v; S.save(); }),
    h("label", { class: "ms" }, h("span", { text: "משך" }), U.range(100, 3000, 50, S.settings.transMs, v => { S.settings.transMs = v; S.save(); }, v => (v / 1000).toFixed(1) + " שנ'")));
}

/* ---------- מקשים ---------- */
document.addEventListener("keydown", e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey || $("#dlg").open) return;
  const d = e.code.startsWith("Digit") ? +e.code.slice(5) : 0;
  if (d >= 1 && e.shiftKey) { const o = S.overlays[d - 1]; if (o) { o.on = !o.on; if (U.renderOverlays) U.renderOverlays(); e.preventDefault(); } return; }
  if (d >= 1 && S.scenes[d - 1]) { S.settings.studio ? (S.pvw = S.scenes[d - 1].id, S.emit("scenes")) : U.safeLive(S.scenes[d - 1].id); e.preventDefault(); }
  else if (e.code === "Space" || e.code === "Enter") { if (S.settings.studio) U.safeLive(S.pvw); e.preventDefault(); }
  else if (e.code === "KeyC") U.safeLive(S.pvw, "cut");
  else if (e.code === "KeyB") U.brb();
  else if (e.code === "KeyN") U.act("next");
  else if (e.code === "KeyY") U.act("replay");
  else if (e.code === "KeyP") U.act("shot");
  else if (e.code === "KeyM") { S.settings.masterVol = S.settings.masterVol > 0 ? 0 : 1; S.applyAudioSettings(); if (U.renderMixer) U.renderMixer(); }
});

U.init = async function (ready) {
  build(); renderTrans();
  U.themeBtn(); U.monBtn();
  S.on("stats", () => { $("#chipFps").textContent = S.settings.w + "x" + S.settings.h + " · " + S.fps + " תמונות/שנ'"; });
  if (ready) ready();
};
U.renderTrans = renderTrans;
})();
