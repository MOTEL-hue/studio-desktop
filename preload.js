// גשר קטן לדפי הנעילה והסיסמה המקומיים בלבד. הוא גם מסמן לאולפן שהוא רץ בתוכנה (בלי כפתור התקנה).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studioDesktop", {
  isDesktop: true,
  unlock: p => ipcRenderer.invoke("unlock", p),
  setPass: (old, next) => ipcRenderer.invoke("set-pass", { old, next }),
  onUpdate: cb => ipcRenderer.on("upd", (_e, s) => cb(s)),
  updateAction: a => ipcRenderer.send("upd-action", a),
});
