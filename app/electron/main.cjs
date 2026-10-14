const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { GitService } = require('./git-service.cjs');
const service = new GitService();
const contexts = new Map();
let mainWindow;
if (process.env.BRANCHLIGHT_USER_DATA) app.setPath('userData', process.env.BRANCHLIGHT_USER_DATA);
const settingsFile = () => path.join(app.getPath('userData'), 'repositories.json');
async function recent() {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), 'utf8')).slice(0, 12);
  } catch {
    return [];
  }
}
async function remember(repo) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify([repo, ...(await recent()).filter(r => r !== repo)].slice(0, 12)));
}
function createWindow(mode = 'browse', repo = '') {
  const win = new BrowserWindow({
    width: mode === 'commit' ? 1220 : 1480,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    title: mode === 'commit' ? 'Commit — Branchlight' : 'Branchlight',
    backgroundColor: '#101318',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const windowId = win.webContents.id;
  contexts.set(windowId, { mode, repo });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('closed', () => contexts.delete(windowId));
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  return win;
}
function context(event) {
  const ctx = contexts.get(event.sender.id);
  if (!ctx) throw new Error('Unknown application window.');
  return ctx;
}
function repoFor(event) {
  const repo = context(event).repo;
  if (!repo) throw new Error('Open a repository first.');
  return repo;
}
function changed(repo) {
  for (const win of BrowserWindow.getAllWindows())
    if (contexts.get(win.webContents.id)?.repo === repo) win.webContents.send('repository-changed');
}
ipcMain.handle('bootstrap', async event => ({ ...context(event), recent: await recent() }));
ipcMain.handle('open-repository', async (event, directory) => {
  const ctx = context(event);
  if (ctx.mode !== 'browse') throw new Error('Open repositories from the main window.');
  if (!directory) {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openDirectory'],
      title: 'Open Git repository'
    });
    if (result.canceled) return null;
    directory = result.filePaths[0];
  }
  const repo = await service.open(directory);
  ctx.repo = repo;
  await remember(repo);
  BrowserWindow.fromWebContents(event.sender).setTitle(`${path.basename(repo)} — Branchlight`);
  return repo;
});
ipcMain.handle('snapshot', (event, limit) => service.snapshot(repoFor(event), limit));
ipcMain.handle('detail', (event, hash) => service.detail(repoFor(event), hash));
ipcMain.handle('diff', (event, request) => service.diff(repoFor(event), request));
ipcMain.handle('mutate', async (event, action, payload) => {
  const repo = repoFor(event);
  const result = await service.mutate(repo, action, payload);
  changed(repo);
  return result;
});
ipcMain.handle('command-log', event => {
  context(event);
  return service.logs;
});
ipcMain.handle('commit-window', event => {
  const repo = repoFor(event);
  const existing = BrowserWindow.getAllWindows().find(win => {
    const ctx = contexts.get(win.webContents.id);
    return ctx?.mode === 'commit' && ctx.repo === repo;
  });
  if (existing) {
    existing.show();
    existing.focus();
  } else createWindow('commit', repo);
});
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const initialRepo = process.env.BRANCHLIGHT_REPO ? await service.open(process.env.BRANCHLIGHT_REPO) : '';
  mainWindow = createWindow('browse', initialRepo);
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) mainWindow = createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
