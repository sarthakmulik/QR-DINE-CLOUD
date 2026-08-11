const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  printHtml: (html, printerName) => ipcRenderer.invoke('print-html', html, printerName),
  printRaw: (data, portName) => ipcRenderer.invoke('print-raw', data, portName),
  testPrint: (printerName) => ipcRenderer.invoke('test-print', printerName)
});
