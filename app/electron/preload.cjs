const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gitClient', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  open: directory => ipcRenderer.invoke('open-repository', directory),
  snapshot: limit => ipcRenderer.invoke('snapshot', limit),
  detail: hash => ipcRenderer.invoke('detail', hash),
  diff: request => ipcRenderer.invoke('diff', request),
  mutate: (action, payload) => ipcRenderer.invoke('mutate', action, payload),
  log: () => ipcRenderer.invoke('command-log'),
  openCommit: () => ipcRenderer.invoke('commit-window'),
  onChanged: callback => {
    const listener = () => callback();
    ipcRenderer.on('repository-changed', listener);
    return () => ipcRenderer.removeListener('repository-changed', listener);
  }
});
