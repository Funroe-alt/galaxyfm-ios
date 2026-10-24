// Galaxy.FM PC app (Electron).
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server.cjs');

const PORT = 5000;
let win;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#0b0b10',
    title: 'Galaxy.FM',
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  });

  // Links like the privacy policy open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  try {
    await startServer({
      port: PORT,
      staticDir: path.join(__dirname, '..', 'dist'),
      binDir: path.join(app.getPath('userData'), 'bin'),
    });
    win.loadURL(`http://localhost:${PORT}`);
  } catch (e) {
    dialog.showErrorBox('Galaxy.FM', e.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use. Close the old start.bat server window and try again.`
      : 'Could not start: ' + e.message);
    app.quit();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
