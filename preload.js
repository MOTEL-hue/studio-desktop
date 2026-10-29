// גשר קטן לדף ההגדרה הראשונית בלבד. האולפן עצמו (האתר) לא מקבל גישה למחשב.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studioDesktop", {
  saveUrl: url => ipcRenderer.invoke("save-url", url),
  getUrl: () => ipcRenderer.invoke("get-url"),
});
