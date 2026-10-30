/* אולפן שידור - נוחות ונגישות: ביטול ושחזור, תזוזה במקלדת, נגישות, מסך המתנה, אזהרה לפני שידור חלון ריק. */
(function () {
"use strict";
const S = window.Studio, U = S.ui, h = U.h, $ = U.$;

/* ---------- ביטול ושחזור ---------- */
const hist = []; let idx = -1, last = "", tm = 0, busy = false;
const dump = () => JSON.stringify(S.scenes, (k, v) => (k === "_thumb" ? undefined : v));
function capture() {
  if (busy) return; const j = dump(); if (j === last) return; last = j; hist.splice(idx + 1); hist.push(j); if (hist.length > 80) hist.shift(); idx = hist.length - 1; btns();
}
const origSave = S.save; S.save = function () { origSave(); clearTimeout(tm); tm = setTimeout(capture, 450); };
function apply(j) {
  busy = true; const ids = new Set(S.scenes.map(x => x.id)); S.scenes = JSON.parse(j); last = j;
  if (!S.scene(S.pgm)) S.pgm = S.scenes[0] && S.scenes[0].id; if (!S.scene(S.pvw)) S.pvw = S.pgm;
  S.emit("scenes"); busy = false; btns(); origSave(); return ids;
}
function btns() { const u = $("#btnUndo"), r = $("#btnRedo"); if (u) u.disabled = idx <= 0; if (r) r.disabled = idx >= hist.length - 1; }
U.undo = function () { clearTimeout(tm); capture(); if (idx > 0) { idx--; apply(hist[idx]); U.toast("בוטלה הפעולה האחרונה"); } };
U.redo = function () { if (idx < hist.length - 1) { idx++; apply(hist[idx]); U.toast("הפעולה שוחזרה"); } };
S.on("scenes", () => { clearTimeout(tm); tm = setTimeout(capture, 450); });
setTimeout(() => { capture(); btns(); }, 800);

/* ---------- הזזה וגודל במקלדת ---------- */
document.addEventListener("keydown", e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || $("#dlg").open) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyZ" || e.code === "KeyY")) { e.preventDefault(); (e.code === "KeyY" || e.shiftKey) ? U.redo() : U.undo(); return; }
  const i = U.selectedWindow && U.selectedWindow(), sc = S.scene(U.editId()); if (e.ctrlKey || e.metaKey || e.altKey || !sc || i == null || i < 0) return;
  const step = e.shiftKey ? 0.05 : 0.01, sl = sc.slots[i], cur = S.rectsOf(sc, 1920, 1080).find(r => r.i === i); if (!cur) return;
  let [x, y, w, hh] = sl.rect || [cur.x / 1920, cur.y / 1080, cur.w / 1920, cur.h / 1080], ok = true;
  if (e.key === "ArrowLeft") x -= step; else if (e.key === "ArrowRight") x += step; else if (e.key === "ArrowUp") y -= step; else if (e.key === "ArrowDown") y += step;
  else if (e.key === "+" || e.key === "=") { x -= step / 2; y -= step / 2; w += step; hh += step; } else if (e.key === "-") { x += step / 2; y += step / 2; w = Math.max(.06, w - step); hh = Math.max(.06, hh - step); }
  else if (e.key === "Delete" || e.key === "Backspace") { if (sl.rect) { sl.rect = null; S.save(); U.drawSel(); U.renderEditor(); } e.preventDefault(); return; }
  else ok = false;
  if (!ok) return; e.preventDefault(); sl.rect = [x, y, w, hh]; U.drawSel(); S.save();
});

/* ---------- אזהרה לפני שידור סצנה עם חלון ריק ---------- */
U.safeLive = function (id, type) {
  const sc = S.scene(id); if (!sc) return;
  const bad = []; for (let i = 0, n = S.slotCount(sc); i < n; i++) { const s = sc.slots[i], src = S.src(s.src); if (!src || src.missing || src.error) bad.push(i + 1); }
  if (!bad.length || sc.id === S.pgm) return S.goLive(id, type);
  U.dialog("בסצנה יש חלון בלי תמונה", h("p", { text: "בחלון " + bad.join(", ") + " אין מקור פעיל, והצופים יראו שם מסך ריק. לשדר בכל זאת?" }),
    [["כן, לשדר", () => { S.goLive(id, type); }, "danger"], ["ביטול", null, ""]]);
};

/* ---------- מסך המתנה: "רגע, חוזרים מיד" ---------- */
let brbPrev = null;
U.brb = function () {
  let sc = S.scenes.find(x => x.brb);
  if (!sc) {
    const src = S.sources.find(x => x.brb) || null;
    S.addSource({ kind: "text", name: "רגע, חוזרים מיד", props: { text: "רגע, חוזרים מיד...", size: 140, color: "#ffffff", bg: "#16233F", align: "center", bold: true } }).then(t => {
      t.brb = true; sc = S.newScene("רגע, חוזרים מיד", "full"); sc.brb = true; sc.slots[0].src = t.id; S.scenes.push(sc); S.save(); S.emit("scenes"); U.brb();
    }); return;
  }
  if (S.pgm !== sc.id) { brbPrev = S.pgm; S.settings.studio ? (S.pvw = sc.id, S.take("cut")) : S.goLive(sc.id, "cut"); U.toast("מסך המתנה בשידור. לחצו שוב (או B) כדי לחזור."); $("#btnBrb").classList.add("on"); }
  else { const back = S.scene(brbPrev) ? brbPrev : (S.scenes.find(x => !x.brb) || sc).id; S.pvw = back; S.take("cut"); $("#btnBrb").classList.remove("on"); }
};

/* ---------- נגישות ---------- */
const A_KEY = "studio.a11y";
const A = { size: 100, contrast: false, motion: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches };
try { Object.assign(A, JSON.parse(localStorage.getItem(A_KEY) || "{}")); } catch (e) { /* בלי שמירה */ }
function applyA() {
  const r = document.documentElement; r.style.fontSize = (14 * A.size / 100) + "px"; r.toggleAttribute("data-contrast", !!A.contrast); r.toggleAttribute("data-calm", !!A.motion); S.reduceMotion = !!A.motion;
  try { localStorage.setItem(A_KEY, JSON.stringify(A)); } catch (e) { /* בלי שמירה */ }
}
applyA();
U.a11yDlg = function () {
  U.dialog("נגישות והתאמות", h("div", { class: "form" },
    U.field("גודל הכתב בכל הדף", U.sel([[100, "רגיל"], [120, "גדול"], [145, "גדול מאוד"], [175, "ענק"]], A.size, v => { A.size = +v; applyA(); })),
    U.check("ניגודיות גבוהה", A.contrast, v => { A.contrast = v; applyA(); }, "צבעים חזקים וקווים בולטים, לקריאה קלה יותר."),
    U.check("הפחתת תנועה", A.motion, v => { A.motion = v; applyA(); }, "מבטל אנימציות בדף, וכל המעברים בשידור הופכים לחיתוך מיידי."),
    h("p", { class: "hint", text: "מקלדת: Tab מעביר בין הכפתורים, Enter מפעיל. אחרי לחיצה על חלון בתצוגה המקדימה אפשר להזיז אותו בחיצים (Shift = גדול יותר), לשנות גודל ב- + ו- -, ולהחזיר ל-Delete. Ctrl+Z מבטל פעולה." })),
    [["סגירה", null, "go"]]);
};
})();
