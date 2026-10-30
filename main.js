/* אולפן שידור - תוכנה למחשב. עוטפת את דף האולפן של האתר בחלון משלו, ומוסיפה מה שדפדפן לא יכול:
   מקשי קיצור כלליים, אישור אוטומטי של מצלמה ומיקרופון, שיתוף מסך בלי חלון בקשה, חלון הצגה במסך השני,
   וחלון שלא מואט ברקע. האולפן עצמו נטען מהאתר, ולכן מתעדכן אוטומטית; בלי אינטרנט הוא נפתח מהמטמון. */
const { app, BrowserWindow, Menu, dialog, desktopCapturer, globalShortcut, ipcMain, session, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");

/* גוגל חוסמת כניסה מתוך חלון של תוכנה ("Electron" בזיהוי), לכן מציגים את אותו זיהוי כמו של Chrome רגיל */
const CHROME_UA = app.userAgentFallback.replace(/\s*Electron\/\S+/i, "").replace(/\s*Studio\/\S+/i, "").replace(/\s*studio-desktop\/\S+/i, "");
app.userAgentFallback = CHROME_UA;
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

const CFG_FILE = () => path.join(app.getPath("userData"), "config.json");
let cfg = { siteUrl: "", globalKeys: true, numpad: false };
function loadCfg() { try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_FILE(), "utf8"))); } catch (e) { /* פעם ראשונה */ } if (process.env.STUDIO_SITE) cfg.siteUrl = process.env.STUDIO_SITE; }
function saveCfg() { try { fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(cfg, null, 2)); } catch (e) { /* בלי שמירה */ } }
const studioUrl = () => cfg.siteUrl.replace(/\/+$/, "") + "/studio/";
const origin = () => { try { return new URL(cfg.siteUrl).origin; } catch (e) { return ""; } };

let win = null;
const run = js => { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(js).catch(() => {}); };
const act = (c, a) => run(`window.Studio&&Studio.ui&&Studio.ui.act&&Studio.ui.act(${JSON.stringify(c)},${JSON.stringify(a || "")})`);

function createWindow() {
  win = new BrowserWindow({ width: 1500, height: 950, minWidth: 1000, minHeight: 650, backgroundColor: "#0e1117", title: "אולפן שידור", autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false } });
  win.on("closed", () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === "studio_out" || /\/studio\/output\/?$/.test(url)) {
      const ds = screen.getAllDisplays(), main = screen.getDisplayMatching(win.getBounds()), ext = ds.find(d => d.id !== main.id) || main, b = ext.bounds;
      return { action: "allow", overrideBrowserWindowOptions: { x: b.x, y: b.y, width: b.width, height: b.height, fullscreen: ds.length > 1, autoHideMenuBar: true, backgroundColor: "#000000", title: "חלון הצגה",
        webPreferences: { backgroundThrottling: false, contextIsolation: true } } };
    }
    shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:") && new URL(url).origin !== origin()) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMain) => { if (isMain && code !== -3 && url.startsWith("http")) setTimeout(() => { if (win) win.loadURL(studioUrl()); }, 4000); });
  load();
}
function load() { if (!win) return; if (!cfg.siteUrl) win.loadFile(path.join(__dirname, "setup.html")); else win.loadURL(studioUrl()); }

function setupSession() {
  session.defaultSession.setUserAgent(CHROME_UA);
  const ses = session.defaultSession, ok = new Set(["media", "midi", "midiSysex", "display-capture", "fullscreen", "window-management", "clipboard-sanitized-write", "notifications", "audioCapture", "videoCapture"]);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(ok.has(perm)));
  ses.setPermissionCheckHandler((wc, perm) => ok.has(perm));
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
  globalShortcut.unregisterAll();
  if (cfg.globalKeys) {
    KEYS.forEach(([k, c]) => { try { globalShortcut.register(k, () => act(c)); } catch (e) { /* תפוס */ } });
    for (let i = 1; i <= 9; i++) { try { globalShortcut.register(`CommandOrControl+Alt+${i}`, () => run(`window.Studio&&Studio.ui.act("scene",(Studio.scenes.filter(s=>!s.brb)[${i - 1}]||{}).id)`)); } catch (e) { /* תפוס */ } }
  }
  if (cfg.numpad) {
    const pad = { num0: ["brb"], numadd: ["next"], numsub: ["prev"], numdiv: ["prog", "next"], nummult: ["cut"] };
    Object.entries(pad).forEach(([k, [c, a]]) => { try { globalShortcut.register(k, () => act(c, a)); } catch (e) { /* תפוס */ } });
    for (let i = 1; i <= 9; i++) { try { globalShortcut.register(`num${i}`, () => run(`window.Studio&&Studio.ui.act("scene",(Studio.scenes.filter(s=>!s.brb)[${i - 1}]||{}).id)`)); } catch (e) { /* תפוס */ } }
  }
}

function buildMenu() {
  const t = [
    { label: "אולפן", submenu: [
      { label: "רענון", accelerator: "F5", click: () => load() },
      { label: "מסך מלא", accelerator: "F11", click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: "פתיחת חלון הצגה במסך השני", click: () => run(`window.Studio&&Studio.ui.openOutput()`) },
      { type: "separator" },
      { label: "שינוי כתובת האתר...", click: () => { cfg.siteUrl = ""; saveCfg(); load(); } },
      { label: "יציאה", role: "quit" } ] },
    { label: "מקשי קיצור כלליים", submenu: [
      { label: "מקשי Ctrl+Alt (חץ ימינה/שמאלה = הבאה/קודמת, 1-9 = סצנות)", type: "checkbox", checked: cfg.globalKeys, click: m => { cfg.globalKeys = m.checked; saveCfg(); registerKeys(); } },
      { label: "מקשי מספרים כלליים (נאמפד שולט גם מחוץ לאולפן)", type: "checkbox", checked: cfg.numpad, click: m => { cfg.numpad = m.checked; saveCfg(); registerKeys(); } } ] },
    { label: "תצוגה", submenu: [{ role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "toggleDevTools", label: "כלי פיתוח" }] },
    { label: "עזרה", submenu: [{ label: "מדריך למתחילים", click: () => run(`window.Studio&&Studio.ui.showTab("help")`) }, { label: `גרסה ${app.getVersion()}`, enabled: false }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

// הגשר מיועד רק לדף ההגדרה המקומי, לא לאתר
const local = e => !!e.senderFrame && e.senderFrame.url.startsWith("file:");
ipcMain.handle("get-url", e => (local(e) ? cfg.siteUrl : ""));
ipcMain.handle("save-url", (e, raw) => {
  if (!local(e)) return { error: "לא מורשה" };
  let u; try { u = new URL(/^https?:\/\//.test(raw) ? raw : "https://" + raw); } catch (e) { return { error: "הכתובת לא תקינה" }; }
  cfg.siteUrl = u.origin; saveCfg(); load(); return { ok: true };
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    loadCfg(); setupSession(); buildMenu(); createWindow(); registerKeys();
    if (app.isPackaged) { try { require("electron-updater").autoUpdater.checkForUpdatesAndNotify(); } catch (e) { /* בלי עדכון */ } }
    app.on("activate", () => { if (!win) createWindow(); });
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}
