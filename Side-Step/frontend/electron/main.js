const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");

function argVal(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const serverUrl = argVal("url") || "http://127.0.0.1:8770";
const authToken = argVal("token") || "";

app.setName("Side-Step");
if (process.platform === "linux") app.setDesktopName("Side-Step");

// GPU flags
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");

if (process.platform === "linux") {
  app.commandLine.appendSwitch("ozone-platform", "x11");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}

Menu.setApplicationMenu(null);

ipcMain.handle("get-token", () => authToken);
ipcMain.on("boot-error", (_e, msg) => {
  console.error("[Side-Step] Boot error:", msg);
});

function resolveIcon() {
  const assetsDir = path.join(__dirname, "..", "assets");
  const fs = require("fs");
  if (process.platform === "win32") {
    const ico = path.join(assetsDir, "icon.ico");
    if (fs.existsSync(ico)) return ico;
  }
  const png = path.join(assetsDir, "icon.png");
  if (fs.existsSync(png)) return png;
  return undefined;
}

app.whenReady().then(() => {
  const iconPath = resolveIcon();

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#16161E",
    transparent: false,
    hasShadow: true,
    autoHideMenuBar: true,
    title: "Side-Step",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const sep = serverUrl.includes("?") ? "&" : "?";
  win.loadURL(`${serverUrl}${sep}token=${authToken}`);
  win.maximize();

  win.webContents.on("did-finish-load", () => {
    win.focus();
    win.webContents.focus();
  });

  // Custom close flow: ask the renderer to show an in-app modal instead of
  // the stock OS dialog.  The renderer replies via "confirm-close" IPC.
  let forceClose = false;

  win.on("close", (e) => {
    if (!forceClose) {
      e.preventDefault();
      win.webContents.send("close-requested");
    }
  });

  // Renderer confirmed the user wants to leave.
  ipcMain.on("confirm-close", () => {
    forceClose = true;
    win.close();
  });

  // Renderer says the user cancelled — allow beforeunload to pass through
  // harmlessly if it fires on a future close.
  win.webContents.on("will-prevent-unload", (e) => {
    if (forceClose) e.preventDefault();
  });

  win.on("closed", () => app.quit());
});

app.on("window-all-closed", () => app.quit());
