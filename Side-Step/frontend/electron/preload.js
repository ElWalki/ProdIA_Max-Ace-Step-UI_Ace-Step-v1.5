const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sidestepElectron", {
  getToken: () => ipcRenderer.invoke("get-token"),
  onBootError: (msg) => ipcRenderer.send("boot-error", String(msg)),
  onCloseRequested: (cb) => ipcRenderer.on("close-requested", () => cb()),
  confirmClose: () => ipcRenderer.send("confirm-close"),
});
