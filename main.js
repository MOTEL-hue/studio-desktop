/* אולפן שידור - תוכנה עצמאית למחשב (בלי אתר ובלי כניסה). האולפן נארז בתוכנה ורץ מקומית:
   מקשי קיצור כלליים, אישור אוטומטי של מצלמה ומיקרופון, שיתוף מסך בתפריט, חלון הצגה במסך השני,
   חלון שלא מואט ברקע, סיסמה אופציונלית לתוכנה, ועדכון אוטומטי של התוכנה מבפנים. */
const { app, BrowserWindow, Menu, dialog, desktopCapturer, globalShortcut, ipcMain, protocol, session, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/* זיהוי כמו Chrome רגיל (בלי המילה Electron) */
const CHROME_UA = app.userAgentFallback.replace(/\s*Electron\/\S+/i, "").replace(/\s*Studio\/\S+/i, "").replace(/\s*studio-desktop\/\S+/i, "");
app.userAgentFallback = CHROME_UA;
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

/* האולפן נטען מכתובת פנימית app://studio כדי שיהיה לו מקור אמיתי (שמירת הגדרות, חלון הצגה, מצלמה) */
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };
const APP_DIR = path.join(__dirname, "app");
const STUDIO_URL = "app://studio/index.html";

const CFG_FILE = () => path.join(app.getPath("userData"), "config.json");
let cfg = { globalKeys: true, numpad: false, pass: null };
function loadCfg() { try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_FILE(), "utf8"))); } catch (e) { /* פעם ראשונה */ } }
function saveCfg() { try { fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(cfg, null, 2)); } catch (e) { /* בלי שמירה */ } }

/* סיסמה (לא חובה): נשמרת מוצפנת בקובץ ההגדרות */
const hash = (p, salt) => crypto.scryptSync(String(p), salt, 32).toString("hex");
function setPass(p) { if (!p) { cfg.pass = null; } else { const salt = crypto.randomBytes(16).toString("hex"); cfg.pass = { salt, hash: hash(p, salt) }; } saveCfg(); }
function checkPass(p) {
  if (!cfg.pass) return true;
  try { return crypto.timingSafeEqual(Buffer.from(hash(p, cfg.pass.salt), "hex"), Buffer.from(cfg.pass.hash, "hex")); } catch (e) { return false; }
}
let unlocked = false;

let win = null;
const run = js => { if (unlocked && win && !win.isDestroyed()) win.webContents.executeJavaScript(js).catch(() => {}); };
const act = (c, a) => run(`window.Studio&&Studio.ui&&Studio.ui.act&&Studio.ui.act(${JSON.stringify(c)},${JSON.stringify(a || "")})`);
const sceneN = n => run(`window.Studio&&Studio.ui.act("scene",(Studio.scenes.filter(s=>!s.brb)[${n - 1}]||{}).id)`);

function load() { if (!win) return; if (cfg.pass && !unlocked) win.loadFile(path.join(__dirname, "lock.html")); else win.loadURL(STUDIO_URL); }
function lockNow() { if (!cfg.pass) { dialog.showMessageBox(win, { type: "info", message: "לא הוגדרה סיסמה", detail: "אפשר להגדיר מהתפריט: אולפן ← סיסמה לתוכנה." }); return; } unlocked = false; globalShortcut.unregisterAll(); load(); }

function createWindow() {
  win = new BrowserWindow({ width: 1500, height: 950, minWidth: 1000, minHeight: 650, backgroundColor: "#0e1117", title: "אולפן שידור",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false } });
  win.on("closed", () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === "studio_out" || /\/output\.html$/.test(url)) {
      const ds = screen.getAllDisplays(), main = screen.getDisplayMatching(win.getBounds()), ext = ds.find(d => d.id !== main.id) || main, b = ext.bounds;
      return { action: "allow", overrideBrowserWindowOptions: { x: b.x, y: b.y, width: b.width, height: b.height, fullscreen: ds.length > 1, autoHideMenuBar: true, backgroundColor: "#000000", title: "חלון הצגה",
        webPreferences: { backgroundThrottling: false, contextIsolation: true } } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  load();
}

function setupSession() {
  const ses = session.defaultSession, ok = new Set(["media", "midi", "midiSysex", "display-capture", "fullscreen", "window-management", "clipboard-sanitized-write", "notifications", "audioCapture", "videoCapture"]);
  ses.setUserAgent(CHROME_UA);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(ok.has(perm)));
  ses.setPermissionCheckHandler((wc, perm) => ok.has(perm));
  protocol.handle("app", async req => {
    let rel = decodeURIComponent(new URL(req.url).pathname); if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR + path.sep)) return new Response("", { status: 403 });
    try { return new Response(await fs.promises.readFile(file), { headers: { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" } }); }
    catch (e) { return new Response("", { status: 404 }); }
  });
  // שיתוף מסך: תפריט קטן עם המסכים והחלונות, במקום חלון הבקשה של הדפדפן
  ses.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const src = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 96, height: 54 }, fetchWindowIcons: false });
      if (src.length <= 1) { callback(src[0] ? { video: src[0], audio: "loopback" } : {}); return; }
      let done = false; const pick = s => { if (!done) { done = true; callback(s ? { video: s, audio: "loopback" } : {}); } };
      const menu = Menu.buildFromTemplate(src.map(s => ({ label: (s.id.startsWith("screen") ? "🖥️ " : "🗔 ") + s.name, icon: s.thumbnail.resize({ width: 48 }), click: () => pick(s) })).concat([{ type: "separator" }, { label: "ביטול", click: () => pick(null) }]));
      menu.once("menu-will-close", () => setTimeout(() => pick(null), 300)); menu.popup({ window: win });
    } catch (e) { callback({}); }
  });
}

/* מקשי קיצור כלליים: עובדים גם כשחלון אחר בחזית */
const KEYS = [["CommandOrControl+Alt+Right", "next"], ["CommandOrControl+Alt+Left", "prev"], ["CommandOrControl+Alt+Down", "take"], ["CommandOrControl+Alt+Up", "cut"], ["CommandOrControl+Alt+B", "brb"], ["CommandOrControl+Alt+M", "mute"]];
function registerKeys() {
  globalShortcut.unregisterAll(); if (!unlocked) return;
  const reg = (k, f) => { try { globalShortcut.register(k, f); } catch (e) { /* תפוס */ } };
  if (cfg.globalKeys) { KEYS.forEach(([k, c]) => reg(k, () => act(c))); for (let i = 1; i <= 9; i++) reg(`CommandOrControl+Alt+${i}`, () => sceneN(i)); }
  if (cfg.numpad) {
    Object.entries({ num0: ["brb"], numadd: ["next"], numsub: ["prev"], numdiv: ["prog", "next"], nummult: ["cut"] }).forEach(([k, [c, a]]) => reg(k, () => act(c, a)));
    for (let i = 1; i <= 9; i++) reg(`num${i}`, () => sceneN(i));
  }
}

/* סיסמה: חלון קטן להגדרה או הסרה */
function passWindow() {
  const w = new BrowserWindow({ width: 440, height: 400, parent: win, modal: true, resizable: false, autoHideMenuBar: true, title: "סיסמה לתוכנה", backgroundColor: "#0e1117",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  w.loadFile(path.join(__dirname, "setpass.html"), { query: { has: cfg.pass ? "1" : "" } });
}

/* עדכון התוכנה מבפנים: בודקת בכל הפעלה, מורידה ברקע עם חלון התקדמות (אחוזים, מהירות וגודל), ושואלת אם להפעיל מחדש ולהתקין */
let updater = null, updWin = null, updState = null, manual = false;
const upd = state => {
  updState = Object.assign({}, updState || {}, state);
  if (!updWin || updWin.isDestroyed()) {
    updWin = new BrowserWindow({ width: 460, height: 310, parent: win || undefined, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true, title: "עדכון התוכנה", backgroundColor: "#0e1117",
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
    updWin.on("closed", () => { updWin = null; });
    updWin.loadFile(path.join(__dirname, "update.html")).then(() => updWin && updWin.webContents.send("upd", updState));
  } else updWin.webContents.send("upd", updState);
};
function initUpdater() {
  if (!app.isPackaged && !process.env.STUDIO_FAKE_UPDATE) return;
  if (process.env.STUDIO_FAKE_UPDATE) { simulate(); return; }
  try {
    updater = require("electron-updater").autoUpdater; updater.autoDownload = true;
    updater.on("update-available", info => upd({ phase: "download", version: info.version, percent: 0 }));
    updater.on("download-progress", p => upd({ phase: "download", percent: p.percent, speed: p.bytesPerSecond, done: p.transferred, total: p.total }));
    updater.on("update-downloaded", info => upd({ phase: "ready", version: info.version, percent: 100 }));
    updater.on("update-not-available", () => { if (manual) { manual = false; dialog.showMessageBox(win, { type: "info", message: "התוכנה מעודכנת", detail: "גרסה " + app.getVersion() }); } });
    updater.on("error", () => { if (manual) { manual = false; dialog.showMessageBox(win, { type: "warning", message: "לא הצלחנו לבדוק עדכון", detail: "בדקו שיש חיבור לאינטרנט." }); } else if (updState && updState.phase === "download") upd({ phase: "error" }); });
    updater.checkForUpdates().catch(() => {});
  } catch (e) { /* בלי עדכון */ }
}
function manualCheck() {
  if (!updater) { dialog.showMessageBox(win, { type: "info", message: "בדיקת עדכון זמינה רק בתוכנה המותקנת" }); return; }
  if (updState && (updState.phase === "download" || updState.phase === "ready")) { upd({}); return; }
  manual = true; updater.checkForUpdates().catch(() => {});
}
ipcMain.on("upd-action", (e, a) => {
  if (!e.senderFrame || !e.senderFrame.url.startsWith("file:")) return;
  if (a === "install" && updater) updater.quitAndInstall(true, true);
  else if (a === "later" && updWin) updWin.close();
});
function simulate() { // בדיקה בלבד: מדמה הורדה (STUDIO_FAKE_UPDATE=1)
  let p = 0; upd({ phase: "download", version: "9.9.9", percent: 0, total: 96e6 });
  const t = setInterval(() => { p += 7; if (p >= 100) { clearInterval(t); upd({ phase: "ready", percent: 100 }); } else upd({ phase: "download", percent: p, done: p * 0.96e6, total: 96e6, speed: 5.2e6 }); }, 400);
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "אולפן", submenu: [
      { label: "רענון", accelerator: "F5", click: () => load() },
      { label: "מסך מלא", accelerator: "F11", click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: "פתיחת חלון הצגה במסך השני", click: () => run(`window.Studio&&Studio.ui.openOutput()`) },
      { type: "separator" },
      { label: "סיסמה לתוכנה...", click: () => passWindow() },
      { label: "נעילה עכשיו", click: () => lockNow() },
      { type: "separator" },
      { label: "יציאה", role: "quit" } ] },
    { label: "מקשי קיצור כלליים", submenu: [
      { label: "מקשי Ctrl+Alt (חץ ימינה/שמאלה = הבאה/קודמת, 1-9 = סצנות)", type: "checkbox", checked: cfg.globalKeys, click: m => { cfg.globalKeys = m.checked; saveCfg(); registerKeys(); } },
      { label: "מקשי מספרים כלליים (נאמפד שולט גם מחוץ לאולפן)", type: "checkbox", checked: cfg.numpad, click: m => { cfg.numpad = m.checked; saveCfg(); registerKeys(); } } ] },
    { label: "תצוגה", submenu: [{ role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "toggleDevTools", label: "כלי פיתוח" }] },
    { label: "עזרה", submenu: [{ label: "מדריך למתחילים", click: () => run(`window.Studio&&Studio.ui.showTab("help")`) }, { label: "בדיקת עדכון עכשיו", click: () => manualCheck() }, { label: `גרסה ${app.getVersion()}`, enabled: false }] },
  ]));
}

/* הגשר משרת רק את דפי הנעילה והסיסמה המקומיים */
const local = e => !!e.senderFrame && e.senderFrame.url.startsWith("file:");
ipcMain.handle("unlock", (e, p) => { if (!local(e)) return false; if (!checkPass(p)) return false; unlocked = true; registerKeys(); setImmediate(load); return true; });
ipcMain.handle("set-pass", (e, { old, next }) => {
  if (!local(e)) return { error: "לא מורשה" };
  if (cfg.pass && !checkPass(old)) return { error: "הסיסמה הנוכחית שגויה" };
  if (next && next.length < 4) return { error: "הסיסמה צריכה להיות לפחות 4 תווים" };
  setPass(next); return { ok: true };
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    loadCfg(); unlocked = !cfg.pass; setupSession(); buildMenu(); createWindow(); registerKeys(); initUpdater();
    app.on("activate", () => { if (!win) createWindow(); });
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}
