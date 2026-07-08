const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printHtml: (html, printerName) => ipcRenderer.invoke('print-html', html, printerName),
  testPrint: (printerName) => ipcRenderer.invoke('test-print', printerName)
});
