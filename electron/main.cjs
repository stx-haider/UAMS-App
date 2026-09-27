const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const { open, readFile } = require('node:fs/promises');
const path = require('node:path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'uams', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveApp(request) {
  const distDir = path.join(app.getAppPath(), 'dist');
  const url = new URL(request.url);
  let requested = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!requested || requested.endsWith('/')) requested += 'index.html';
  let filePath = path.resolve(distDir, requested);
  if (!filePath.startsWith(`${path.resolve(distDir)}${path.sep}`) && filePath !== path.join(distDir, 'index.html')) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const body = await readFile(filePath);
    return new Response(body, { headers: { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' } });
  } catch {
    // Client-side router routes (for example /attendance) use the packaged HTML shell.
    filePath = path.join(distDir, 'index.html');
    try {
      return new Response(await readFile(filePath), { headers: { 'Content-Type': mimeTypes['.html'] } });
    } catch {
      return new Response('The packaged app files are missing. Reinstall the application.', { status: 500 });
    }
  }
}

async function createWindow() {
  await protocol.handle('uams', serveApp);
  ipcMain.handle('uams:save-file', async (_event, { name, base64 }) => {
    if (typeof base64 !== 'string' || base64.length > 100 * 1024 * 1024) {
      throw new Error('The export file is invalid or too large.');
    }
    const requestedName = Array.from(path.basename(String(name || 'UAMS_Export')))
      .map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character)
      .join('').replace(/[. ]+$/, '') || 'UAMS_Export';
    const { name: baseName, ext } = path.parse(requestedName);
    const data = Buffer.from(base64, 'base64');
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const fileName = suffix ? `${baseName} (${suffix})${ext}` : requestedName;
      const filePath = path.join(app.getPath('downloads'), fileName);
      try {
        const file = await open(filePath, 'wx');
        try {
          await file.writeFile(data);
        } finally {
          await file.close();
        }
        return { filePath, fileName };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    throw new Error('Could not find a unique filename in Downloads.');
  });
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 360,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f8fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('uams://app/')) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await window.loadURL('uams://app/login');
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('Could not start University Attendance System:', error);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
